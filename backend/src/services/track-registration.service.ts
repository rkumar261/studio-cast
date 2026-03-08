import { track_kind, track_state } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import type { RegisterTrackBody, RegisterTrackResponse } from '../dto/tracks/register.dto.js';
import type { RequestPrincipal } from '../lib/request-principal.js';

type ServiceResult<T> =
  | { code: 'ok'; data: T }
  | { code: 'not_found' }
  | { code: 'forbidden' }
  | { code: 'participant_not_found' }
  | { code: 'invalid_participant' };

function toDto(row: {
  id: string;
  recording_id: string;
  participant_id: string;
  kind: track_kind;
  codec: string | null;
  state: track_state;
  created_at: Date;
}): RegisterTrackResponse['track'] {
  return {
    id: row.id,
    recordingId: row.recording_id,
    participantId: row.participant_id,
    kind: row.kind,
    codec: row.codec ?? undefined,
    state: row.state,
    createdAt: row.created_at.toISOString(),
  };
}

export async function registerTrackIdentityService(args: {
  recordingId: string;
  principal: RequestPrincipal;
  body: RegisterTrackBody;
}): Promise<ServiceResult<RegisterTrackResponse>> {
  const rec = await prisma.recording.findUnique({
    where: { id: args.recordingId },
    select: { id: true, userId: true },
  });

  if (!rec) return { code: 'not_found' };
  if (args.principal.kind === 'user') {
    if (rec.userId && rec.userId !== args.principal.userId) return { code: 'forbidden' };
  } else if (args.principal.recordingId !== args.recordingId) {
    return { code: 'forbidden' };
  }

  const participant = await prisma.participant.findUnique({
    where: { id: args.body.participantId },
    select: { id: true, recording_id: true },
  });

  if (!participant) return { code: 'participant_not_found' };
  if (participant.recording_id !== args.recordingId) return { code: 'invalid_participant' };
  if (
    args.principal.kind === 'guest' &&
    participant.id !== args.principal.participantId
  ) {
    return { code: 'forbidden' };
  }

  const existing = await prisma.track.findFirst({
    where: {
      recording_id: args.recordingId,
      participant_id: args.body.participantId,
      kind: args.body.kind,
    },
    orderBy: { created_at: 'asc' },
    select: {
      id: true,
      recording_id: true,
      participant_id: true,
      kind: true,
      codec: true,
      state: true,
      created_at: true,
    },
  });

  if (existing) {
    return {
      code: 'ok',
      data: {
        track: toDto(existing),
        existed: true,
      },
    };
  }

  const created = await prisma.track.create({
    data: {
      recording_id: args.recordingId,
      participant_id: args.body.participantId,
      kind: args.body.kind,
      codec: args.body.codec ?? null,
      state: track_state.recording,
    },
    select: {
      id: true,
      recording_id: true,
      participant_id: true,
      kind: true,
      codec: true,
      state: true,
      created_at: true,
    },
  });

  return {
    code: 'ok',
    data: {
      track: toDto(created),
      existed: false,
    },
  };
}
