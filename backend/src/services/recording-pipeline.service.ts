import { recording_status } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { enqueueStitchJob } from '../repositories/job.repo.js';

type TrackChunkRow = {
  state: string;
  storage_key_raw: string | null;
};

type TrackForStitch = {
  id: string;
  storage_key_raw: string | null;
  track_chunk: TrackChunkRow[];
};

function trackReadyForStitch(track: TrackForStitch): boolean {
  if (track.storage_key_raw) return false;
  if (track.track_chunk.length === 0) return false;
  return track.track_chunk.every(
    (chunk) => chunk.state === 'uploaded' && !!chunk.storage_key_raw
  );
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
      track_chunk: {
        some: {},
      },
    },
    select: {
      id: true,
      storage_key_raw: true,
      track_chunk: {
        orderBy: { seq: 'asc' },
        select: {
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
      storage_key_raw: true,
      track_chunk: {
        orderBy: { seq: 'asc' },
        select: {
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

  const totalChunks = await prisma.track_chunk.count({
    where: {
      track: {
        recording_id: recordingId,
      },
    },
  });

  if (totalChunks === 0) return { updated: false };

  const pendingChunks = await prisma.track_chunk.count({
    where: {
      track: {
        recording_id: recordingId,
      },
      OR: [{ state: { not: 'uploaded' } }, { storage_key_raw: null }],
    },
  });

  if (pendingChunks > 0) return { updated: false };

  const tracksWithChunks = await prisma.track.findMany({
    where: {
      recording_id: recordingId,
      track_chunk: {
        some: {},
      },
    },
    select: {
      id: true,
      storage_key_raw: true,
    },
  });

  if (tracksWithChunks.length === 0) return { updated: false };

  const allTracksStitched = tracksWithChunks.every((track) => !!track.storage_key_raw);
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
