import { recording_status } from '@prisma/client';
import type { GetRecordingProgressResponse, RecordingProgressPhase } from '../dto/recordings/progress.dto.js';
import { prisma } from '../lib/prisma.js';

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
  };

  const participants = recording.participant.map((participant) => {
    const tracks = participant.track.map((track) => {
      const latestUpload = track.upload[0];
      const bytesReceived = track.upload.reduce((acc, upload) => acc + Number(upload.bytes_received), 0);
      const uploadState = latestUpload?.state ?? 'pending';

      for (const upload of track.upload) {
        if (upload.state === 'in_progress') summary.uploadsInProgress += 1;
        if (upload.state === 'completed') summary.uploadsCompleted += 1;
      }
      summary.bytesReceived += bytesReceived;
      summary.tracksTotal += 1;
      if (track.state === 'uploaded' || track.state === 'processed') summary.tracksUploaded += 1;
      if (track.state === 'processed') summary.tracksProcessed += 1;

      return {
        trackId: track.id,
        kind: track.kind,
        state: track.state,
        uploadState,
        protocol: latestUpload?.protocol as 'tus' | 'multipart' | undefined,
        bytesReceived,
        updatedAt: latestUpload?.updated_at?.toISOString(),
      };
    });

    const uploadedCount = tracks.filter((track) => track.state === 'uploaded' || track.state === 'processed').length;
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
    participants,
  };

  return { code: 'ok', data };
}
