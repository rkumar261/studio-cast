import { export_type, recording_status } from '@prisma/client';
import type { GetRecordingProgressResponse, RecordingProgressPhase } from '../dto/recordings/progress.dto.js';
import { prisma } from '../lib/prisma.js';
import { REQUIRED_EXPORT_TYPES } from './recording-readiness.service.js';

type ServiceResult<T> =
  | { code: 'ok'; data: T }
  | { code: 'not_found' }
  | { code: 'forbidden' };

function derivePhase(input: {
  status: recording_status;
  startedAt: Date | null;
  stoppedAt: Date | null;
}): RecordingProgressPhase {
  if (input.status === recording_status.error) return 'error';
  if (input.status === recording_status.ready) return 'ready';
  if (input.status === recording_status.processing) return 'processing';
  if (input.startedAt && !input.stoppedAt) return 'recording';
  return 'uploading';
}

export async function getRecordingProgressService(args: {
  recordingId: string;
  requesterId: string;
}): Promise<ServiceResult<GetRecordingProgressResponse>> {
  const recording = await prisma.recording.findUnique({
    where: { id: args.recordingId },
    select: {
      id: true,
      userId: true,
      status: true,
      started_at: true,
      stopped_at: true,
      host_participant_id: true,
      control_version: true,
      export_artifact: {
        where: {
          type: { in: [...REQUIRED_EXPORT_TYPES] },
        },
        orderBy: { updated_at: 'desc' },
        select: {
          id: true,
          type: true,
          state: true,
          last_error: true,
          updated_at: true,
          created_at: true,
        },
      },
      participant: {
        orderBy: { id: 'asc' },
        select: {
          id: true,
          role: true,
          display_name: true,
          track: {
            orderBy: { created_at: 'asc' },
            select: {
              id: true,
              kind: true,
              state: true,
              track_chunk: {
                orderBy: { seq: 'asc' },
                select: {
                  protocol: true,
                  state: true,
                  bytes_received: true,
                  updated_at: true,
                },
              },
              upload: {
                orderBy: { updated_at: 'desc' },
                select: {
                  protocol: true,
                  state: true,
                  bytes_received: true,
                  updated_at: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!recording) return { code: 'not_found' };
  if (recording.userId && recording.userId !== args.requesterId) return { code: 'forbidden' };

  const summary = {
    participantsTotal: recording.participant.length,
    participantsCompleted: 0,
    tracksTotal: 0,
    tracksUploaded: 0,
    tracksProcessed: 0,
    uploadsInProgress: 0,
    uploadsCompleted: 0,
    bytesReceived: 0,
    chunksTotal: 0,
    chunksUploaded: 0,
    chunksPending: 0,
  };

  const participants = recording.participant.map((participant) => {
    const tracks = participant.track.map((track) => {
      const chunks = track.track_chunk;
      const hasChunks = chunks.length > 0;
      const latestUpload = track.upload[0];
      const bytesReceivedFromUploads = track.upload.reduce((acc, upload) => acc + Number(upload.bytes_received), 0);
      const bytesReceivedFromChunks = chunks.reduce((acc, chunk) => acc + Number(chunk.bytes_received), 0);
      const bytesReceived = hasChunks ? bytesReceivedFromChunks : bytesReceivedFromUploads;
      const chunkTotal = chunks.length;
      const chunkUploaded = chunks.filter((chunk) => chunk.state === 'uploaded').length;
      const chunkPending = Math.max(chunkTotal - chunkUploaded, 0);

      let uploadState = latestUpload?.state ?? 'pending';
      if (hasChunks) {
        uploadState = chunkPending === 0 ? 'completed' : 'in_progress';
        if (chunkPending > 0) summary.uploadsInProgress += 1;
        if (chunkPending === 0) summary.uploadsCompleted += 1;
      } else {
        for (const upload of track.upload) {
          if (upload.state === 'in_progress') summary.uploadsInProgress += 1;
          if (upload.state === 'completed') summary.uploadsCompleted += 1;
        }
      }

      summary.bytesReceived += bytesReceived;
      summary.tracksTotal += 1;
      summary.chunksTotal += chunkTotal;
      summary.chunksUploaded += chunkUploaded;
      summary.chunksPending += chunkPending;

      const isTrackUploaded =
        track.state === 'uploaded' ||
        track.state === 'processed' ||
        (hasChunks && chunkPending === 0);

      if (isTrackUploaded) summary.tracksUploaded += 1;
      if (track.state === 'processed') summary.tracksProcessed += 1;

      return {
        trackId: track.id,
        kind: track.kind,
        state: track.state,
        uploadState,
        protocol: (chunks[0]?.protocol ?? latestUpload?.protocol) as 'tus' | 'multipart' | undefined,
        bytesReceived,
        chunkTotal,
        chunkUploaded,
        chunkPending,
        updatedAt: (hasChunks ? chunks[chunks.length - 1]?.updated_at : latestUpload?.updated_at)?.toISOString(),
      };
    });

    const uploadedCount = tracks.filter((track) => {
      if (track.chunkTotal > 0) return track.chunkPending === 0;
      return track.state === 'uploaded' || track.state === 'processed';
    }).length;
    const processedCount = tracks.filter((track) => track.state === 'processed').length;
    const pendingCount = Math.max(tracks.length - uploadedCount, 0);

    if (tracks.length > 0 && pendingCount === 0) {
      summary.participantsCompleted += 1;
    }

    return {
      participantId: participant.id,
      role: participant.role,
      displayName: participant.display_name ?? undefined,
      trackCount: tracks.length,
      uploadedCount,
      processedCount,
      pendingCount,
      tracks,
    };
  });

  const requiredExports = REQUIRED_EXPORT_TYPES.map((requiredType) => {
    const row = recording.export_artifact.find((artifact) => artifact.type === requiredType);
    return {
      type: requiredType as export_type,
      state: (row?.state ?? 'missing') as 'missing' | 'queued' | 'running' | 'succeeded' | 'failed',
      exportId: row?.id,
      updatedAt: row?.updated_at?.toISOString(),
      lastError: row?.last_error ?? undefined,
    };
  });

  const requiredSucceeded = requiredExports.filter((exp) => exp.state === 'succeeded').length;
  const requiredFailed = requiredExports.filter((exp) => exp.state === 'failed').length;
  const requiredPending = requiredExports.length - requiredSucceeded - requiredFailed;

  const data: GetRecordingProgressResponse = {
    recordingId: recording.id,
    status: recording.status,
    phase: derivePhase({
      status: recording.status,
      startedAt: recording.started_at,
      stoppedAt: recording.stopped_at,
    }),
    session: {
      startedAt: recording.started_at?.toISOString(),
      stoppedAt: recording.stopped_at?.toISOString(),
      hostParticipantId: recording.host_participant_id ?? undefined,
      controlVersion: recording.control_version,
    },
    summary,
    exports: {
      requiredTotal: requiredExports.length,
      requiredSucceeded,
      requiredPending,
      requiredFailed,
      required: requiredExports,
    },
    participants,
  };

  return { code: 'ok', data };
}
