import { recording_status } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { enqueueStitchJob } from '../repositories/job.repo.js';
import { evaluateTrackStitchReadiness, evaluateTrackUploadCompleteness } from './track-contiguity.service.js';

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
      stopped_at: true,
    },
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
    const result = await enqueueStitchJob(recordingId, track.id);
    if (result.created) queuedTrackIds.push(track.id);
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

  const result = await enqueueStitchJob(recordingId, track.id);
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
      capture_closed_at: { not: null },
      final_seq: { not: null },
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

  const allFinalizedChunksMaterialized = finalizedTracks.every((track) => {
    const completeness = evaluateTrackUploadCompleteness({
      captureClosedAt: track.capture_closed_at,
      finalSeq: track.final_seq,
      chunks: track.track_chunk,
    });
    return completeness.complete;
  });
  if (!allFinalizedChunksMaterialized) return { updated: false };

  const tracksRequiringStitch = finalizedTracks.filter((track) => (track.final_seq ?? 0) > 0);
  const allTracksStitched = tracksRequiringStitch.every((track) => !!track.storage_key_raw);
  if (!allTracksStitched) return { updated: false };

  if (
    recording.status === recording_status.uploading ||
    recording.status === recording_status.draft
  ) {
    await prisma.recording.update({
      where: { id: recordingId },
      data: { status: recording_status.processing },
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
