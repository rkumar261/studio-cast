import { recording_status } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { enqueueStitchJob } from '../repositories/job.repo.js';
import { evaluateTrackStitchReadiness, evaluateTrackUploadCompleteness } from './track-contiguity.service.js';
import { emitTelemetry } from '../lib/telemetry.js';

type TrackChunkRow = {
  seq: number;
  state: string;
  storage_key_raw: string | null;
};

type TrackForStitch = {
  id: string;
  final_seq: number | null;
  capture_closed_at: Date | null;
  storage_key_raw: string | null;
  track_chunk: TrackChunkRow[];
};

function trackReadyForStitch(track: TrackForStitch): boolean {
  const readiness = evaluateTrackStitchReadiness({
    storageKeyRaw: track.storage_key_raw,
    captureClosedAt: track.capture_closed_at,
    finalSeq: track.final_seq,
    chunks: track.track_chunk,
  });
  return readiness.ready;
}

async function loadRecordingStopState(recordingId: string) {
  return prisma.recording.findUnique({
    where: { id: recordingId },
    select: {
      id: true,
      status: true,
      lifecycle_state: true,
      stopped_at: true,
      upload_completed_at: true,
      processing_started_at: true,
    },
  });
}

async function markTrackReadyForStitch(args: {
  recordingId: string;
  trackId: string;
  lifecycleState?: string | null;
  ingestReadyAt?: Date | null;
}) {
  if (args.lifecycleState === 'ready_for_stitch' && args.ingestReadyAt) return;
  const now = new Date();
  await prisma.track.update({
    where: { id: args.trackId },
    data: {
      lifecycle_state: 'ready_for_stitch',
      ingest_ready_at: args.ingestReadyAt ?? now,
      failed_at: null,
      failure_reason: null,
    },
  }).catch(() => {});
  emitTelemetry({
    event: 'track.ready_for_stitch',
    message: 'Track is ready for stitch',
    recordingId: args.recordingId,
    trackId: args.trackId,
    ingestReadyAt: (args.ingestReadyAt ?? now).toISOString(),
  });
}

export async function maybeEnqueueStitchJobsForRecording(recordingId: string) {
  const recording = await loadRecordingStopState(recordingId);
  if (!recording || !recording.stopped_at) {
    return { queuedTrackIds: [] as string[] };
  }

  const tracks = await prisma.track.findMany({
    where: {
      recording_id: recordingId,
      capture_closed_at: { not: null },
      final_seq: { not: null },
    },
    select: {
      id: true,
      final_seq: true,
      capture_closed_at: true,
      storage_key_raw: true,
      lifecycle_state: true,
      ingest_ready_at: true,
      track_chunk: {
        orderBy: { seq: 'asc' },
        select: {
          seq: true,
          state: true,
          storage_key_raw: true,
        },
      },
    },
  });

  const queuedTrackIds: string[] = [];
  for (const track of tracks) {
    if (!trackReadyForStitch(track)) continue;
    await markTrackReadyForStitch({
      recordingId,
      trackId: track.id,
      lifecycleState: track.lifecycle_state,
      ingestReadyAt: track.ingest_ready_at,
    });
    const result = await enqueueStitchJob(recordingId, track.id);
    if (result.created) {
      queuedTrackIds.push(track.id);
      emitTelemetry({
        event: 'stitch.job.queued',
        message: 'Stitch job queued for finalized track',
        recordingId,
        trackId: track.id,
        trigger: 'recording_reconcile',
      });
    }
  }

  return { queuedTrackIds };
}

export async function maybeEnqueueStitchJobForTrack(recordingId: string, trackId: string) {
  const recording = await loadRecordingStopState(recordingId);
  if (!recording || !recording.stopped_at) {
    return { queued: false as const, reason: 'recording_not_stopped' as const };
  }

  const track = await prisma.track.findFirst({
    where: {
      id: trackId,
      recording_id: recordingId,
    },
    select: {
      id: true,
      final_seq: true,
      capture_closed_at: true,
      storage_key_raw: true,
      lifecycle_state: true,
      ingest_ready_at: true,
      track_chunk: {
        orderBy: { seq: 'asc' },
        select: {
          seq: true,
          state: true,
          storage_key_raw: true,
        },
      },
    },
  });

  if (!track || !trackReadyForStitch(track)) {
    return { queued: false as const, reason: 'track_not_ready' as const };
  }

  await markTrackReadyForStitch({
    recordingId,
    trackId: track.id,
    lifecycleState: track.lifecycle_state,
    ingestReadyAt: track.ingest_ready_at,
  });

  const result = await enqueueStitchJob(recordingId, track.id);
  if (result.created) {
    emitTelemetry({
      event: 'stitch.job.queued',
      message: 'Stitch job queued for track',
      recordingId,
      trackId: track.id,
      trigger: 'chunk_completion',
    });
  }
  return {
    queued: result.created,
    reason: result.created ? ('queued' as const) : ('already_exists' as const),
  };
}

export async function maybeMarkRecordingProcessing(recordingId: string) {
  const recording = await loadRecordingStopState(recordingId);
  if (!recording || !recording.stopped_at) return { updated: false };

  const finalizedTracks = await prisma.track.findMany({
    where: {
      recording_id: recordingId,
    },
    select: {
      id: true,
      final_seq: true,
      capture_closed_at: true,
      storage_key_raw: true,
      track_chunk: {
        orderBy: { seq: 'asc' },
        select: {
          seq: true,
          state: true,
          storage_key_raw: true,
        },
      },
    },
  });
  if (finalizedTracks.length === 0) return { updated: false };

  const allUploadsComplete = finalizedTracks.every((track) => {
    const completeness = evaluateTrackUploadCompleteness({
      captureClosedAt: track.capture_closed_at,
      finalSeq: track.final_seq,
      chunks: track.track_chunk,
    });
    return completeness.complete;
  });
  const now = new Date();
  if (!allUploadsComplete) {
    if (recording.stopped_at && recording.lifecycle_state !== 'post_stop_uploading') {
      await prisma.recording.update({
        where: { id: recordingId },
        data: {
          lifecycle_state: 'post_stop_uploading',
        },
      });
      return { updated: true };
    }
    return { updated: false };
  }

  if (!recording.upload_completed_at || recording.lifecycle_state !== 'upload_complete') {
    await prisma.recording.update({
      where: { id: recordingId },
      data: {
        lifecycle_state: 'upload_complete',
        upload_completed_at: recording.upload_completed_at ?? now,
        failed_at: null,
        failure_reason: null,
      },
    });
  }

  const tracksRequiringStitch = finalizedTracks.filter((track) => (track.final_seq ?? 0) > 0);
  const allTracksStitched = tracksRequiringStitch.every((track) => !!track.storage_key_raw);
  if (!allTracksStitched) return { updated: false };

  if (
    recording.status === recording_status.uploading ||
    recording.status === recording_status.draft
  ) {
    await prisma.recording.update({
      where: { id: recordingId },
      data: {
        status: recording_status.processing,
        lifecycle_state: 'processing',
        upload_completed_at: recording.upload_completed_at ?? now,
        processing_started_at: recording.processing_started_at ?? now,
        failed_at: null,
        failure_reason: null,
      },
    });

    emitTelemetry({
      event: 'recording.processing.entered',
      message: 'Recording moved from upload to processing',
      recordingId,
      sessionId: recordingId,
      status: recording_status.processing,
    });

    return { updated: true };
  }

  return { updated: false };
}

export async function reconcileRecordingPipeline(recordingId: string) {
  const stitch = await maybeEnqueueStitchJobsForRecording(recordingId);
  const processing = await maybeMarkRecordingProcessing(recordingId);

  return {
    queuedTrackIds: stitch.queuedTrackIds,
    movedToProcessing: processing.updated,
  };
}
