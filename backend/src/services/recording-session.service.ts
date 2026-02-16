import { recording_status } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { reconcileRecordingPipeline } from './recording-pipeline.service.js';

type ServiceResult<T> =
  | { code: 'ok'; data: T }
  | { code: 'not_found' }
  | { code: 'forbidden' }
  | { code: 'invalid_transition'; message: string };

export type RecordingSessionDto = {
  recordingId: string;
  status: recording_status;
  startedAt?: string;
  stoppedAt?: string;
  hostParticipantId?: string;
  controlVersion: number;
};

type RecordingSessionResponse = {
  session: RecordingSessionDto;
  canControl: boolean;
};

export type RecordingSessionEvent =
  | 'start_session'
  | 'stop_session'
  | 'mark_processing'
  | 'mark_ready'
  | 'mark_error';

type TransitionResult =
  | { ok: true; next: recording_status }
  | { ok: false; message: string };

function transitionRecordingStatus(
  current: recording_status,
  event: RecordingSessionEvent
): TransitionResult {
  switch (event) {
    case 'start_session':
      if (current === recording_status.draft) return { ok: true, next: recording_status.uploading };
      if (current === recording_status.uploading) return { ok: true, next: recording_status.uploading };
      return { ok: false, message: `Cannot start session from status ${current}` };

    case 'stop_session':
      if (current === recording_status.uploading) return { ok: true, next: recording_status.uploading };
      return { ok: false, message: `Cannot stop session from status ${current}` };

    case 'mark_processing':
      if (current === recording_status.uploading) return { ok: true, next: recording_status.processing };
      return { ok: false, message: `Cannot mark processing from status ${current}` };

    case 'mark_ready':
      if (current === recording_status.processing) return { ok: true, next: recording_status.ready };
      return { ok: false, message: `Cannot mark ready from status ${current}` };

    case 'mark_error':
      return { ok: true, next: recording_status.error };

    default:
      return { ok: false, message: 'Unknown transition event' };
  }
}

function toSessionDto(row: {
  id: string;
  status: recording_status;
  started_at: Date | null;
  stopped_at: Date | null;
  host_participant_id: string | null;
  control_version: number;
}): RecordingSessionDto {
  return {
    recordingId: row.id,
    status: row.status,
    startedAt: row.started_at?.toISOString(),
    stoppedAt: row.stopped_at?.toISOString(),
    hostParticipantId: row.host_participant_id ?? undefined,
    controlVersion: row.control_version,
  };
}

async function findRecordingWithAcl(recordingId: string, requesterId: string) {
  const recording = await prisma.recording.findUnique({
    where: { id: recordingId },
    select: {
      id: true,
      userId: true,
      status: true,
      started_at: true,
      stopped_at: true,
      host_participant_id: true,
      control_version: true,
    },
  });

  if (!recording) return { code: 'not_found' as const };
  if (!recording.userId || recording.userId !== requesterId) return { code: 'forbidden' as const };

  return { code: 'ok' as const, recording };
}

async function tryResolveHostParticipantId(recordingId: string, requesterId: string): Promise<string | null> {
  const hostForUser = await prisma.participant.findFirst({
    where: {
      recording_id: recordingId,
      role: 'host',
      userId: requesterId,
    },
    select: { id: true },
  });
  if (hostForUser?.id) return hostForUser.id;

  const anyHost = await prisma.participant.findFirst({
    where: {
      recording_id: recordingId,
      role: 'host',
    },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  return anyHost?.id ?? null;
}

export async function getRecordingSessionService(args: {
  recordingId: string;
  requesterId: string;
}): Promise<ServiceResult<RecordingSessionResponse>> {
  const acl = await findRecordingWithAcl(args.recordingId, args.requesterId);
  if (acl.code !== 'ok') return { code: acl.code };

  return {
    code: 'ok',
    data: {
      session: toSessionDto(acl.recording),
      canControl: true,
    },
  };
}

export async function startRecordingSessionService(args: {
  recordingId: string;
  requesterId: string;
}): Promise<ServiceResult<RecordingSessionResponse>> {
  const acl = await findRecordingWithAcl(args.recordingId, args.requesterId);
  if (acl.code !== 'ok') return { code: acl.code };

  const transition = transitionRecordingStatus(acl.recording.status, 'start_session');
  if (!transition.ok) {
    return { code: 'invalid_transition', message: transition.message };
  }

  const startedAt = acl.recording.started_at ?? new Date();
  const hostParticipantId =
    acl.recording.host_participant_id ??
    (await tryResolveHostParticipantId(args.recordingId, args.requesterId));

  const updated = await prisma.recording.update({
    where: { id: args.recordingId },
    data: {
      status: transition.next,
      started_at: startedAt,
      stopped_at: null,
      host_participant_id: hostParticipantId,
      control_version: { increment: 1 },
    },
    select: {
      id: true,
      status: true,
      started_at: true,
      stopped_at: true,
      host_participant_id: true,
      control_version: true,
    },
  });

  return {
    code: 'ok',
    data: {
      session: toSessionDto(updated),
      canControl: true,
    },
  };
}

export async function stopRecordingSessionService(args: {
  recordingId: string;
  requesterId: string;
}): Promise<ServiceResult<RecordingSessionResponse>> {
  const acl = await findRecordingWithAcl(args.recordingId, args.requesterId);
  if (acl.code !== 'ok') return { code: acl.code };

  const transition = transitionRecordingStatus(acl.recording.status, 'stop_session');
  if (!transition.ok) {
    return { code: 'invalid_transition', message: transition.message };
  }

  const updated = await prisma.recording.update({
    where: { id: args.recordingId },
    data: {
      status: transition.next,
      stopped_at: new Date(),
      control_version: { increment: 1 },
    },
    select: {
      id: true,
      status: true,
      started_at: true,
      stopped_at: true,
      host_participant_id: true,
      control_version: true,
    },
  });

  // Stop only requests the end of recording. Upload completion can continue in the background.
  await reconcileRecordingPipeline(args.recordingId);

  return {
    code: 'ok',
    data: {
      session: toSessionDto(updated),
      canControl: true,
    },
  };
}
