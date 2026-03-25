import type { FinalizeTrackBody, FinalizeTrackResponse } from '../dto/tracks/finalize.dto.js';
import { prisma } from '../lib/prisma.js';
import type { RequestPrincipal } from '../lib/request-principal.js';
import { reconcileRecordingPipeline } from './recording-pipeline.service.js';
import { emitTelemetry } from '../lib/telemetry.js';

type ServiceResult<T> =
  | { code: 'ok'; data: T }
  | { code: 'not_found' }
  | { code: 'forbidden' }
  | { code: 'invalid_track' }
  | { code: 'invalid_final_seq'; message: string };

export async function finalizeTrackCaptureService(args: {
  recordingId: string;
  trackId: string;
  principal: RequestPrincipal;
  body: FinalizeTrackBody;
}): Promise<ServiceResult<FinalizeTrackResponse>> {
  if (!Number.isInteger(args.body.finalSeq) || args.body.finalSeq < 0) {
    return { code: 'invalid_final_seq', message: 'finalSeq must be a non-negative integer' };
  }

  const recording = await prisma.recording.findUnique({
    where: { id: args.recordingId },
    select: { id: true, userId: true },
  });
  if (!recording) return { code: 'not_found' };
  if (args.principal.kind === 'user') {
    if (recording.userId && recording.userId !== args.principal.userId) return { code: 'forbidden' };
  } else if (args.principal.recordingId !== args.recordingId) {
    return { code: 'forbidden' };
  }

  const track = await prisma.track.findUnique({
    where: { id: args.trackId },
    select: {
      id: true,
      recording_id: true,
      participant_id: true,
      final_seq: true,
      capture_closed_at: true,
      finalized_at: true,
    },
  });
  if (!track || track.recording_id !== args.recordingId) return { code: 'invalid_track' };
  if (
    args.principal.kind === 'guest' &&
    track.participant_id !== args.principal.participantId
  ) {
    return { code: 'forbidden' };
  }

  let captureClosedAtFromClient: Date | null = null;
  if (args.body.captureClosedAt) {
    const parsed = new Date(args.body.captureClosedAt);
    if (Number.isNaN(parsed.getTime())) {
      return { code: 'invalid_final_seq', message: 'captureClosedAt must be an ISO date string' };
    }
    captureClosedAtFromClient = parsed;
  }

  let recordingStartedAtFromClient: Date | null = null;
  if (args.body.recordingStartedAt) {
    const parsed = new Date(args.body.recordingStartedAt);
    if (!Number.isNaN(parsed.getTime())) {
      recordingStartedAtFromClient = parsed;
    }
  }

  const finalizeRequestedAt = new Date();
  const nextFinalSeq = Math.max(track.final_seq ?? 0, args.body.finalSeq);
  const nextCaptureClosedAt = track.capture_closed_at ?? captureClosedAtFromClient ?? finalizeRequestedAt;
  const nextFinalizedAt = track.finalized_at ?? finalizeRequestedAt;

  const updated = await prisma.track.update({
    where: { id: args.trackId },
    data: {
      final_seq: nextFinalSeq,
      capture_closed_at: nextCaptureClosedAt,
      finalized_at: nextFinalizedAt,
      finalize_requested_at: finalizeRequestedAt,
      lifecycle_state: 'finalized',
      failed_at: null,
      failure_reason: null,
      ...(recordingStartedAtFromClient ? { recording_started_at: recordingStartedAtFromClient } : {}),
    },
    select: {
      id: true,
      recording_id: true,
      final_seq: true,
      capture_closed_at: true,
      finalized_at: true,
      finalize_requested_at: true,
    },
  });

  emitTelemetry({
    event: 'track.finalized',
    message: 'Track capture finalized',
    recordingId: args.recordingId,
    trackId: args.trackId,
    participantId: track.participant_id,
    finalSeq: updated.final_seq ?? 0,
    finalizeRequestedAt: updated.finalize_requested_at?.toISOString() ?? finalizeRequestedAt.toISOString(),
    captureClosedAt: updated.capture_closed_at?.toISOString(),
    principalKind: args.principal.kind,
  });

  await reconcileRecordingPipeline(args.recordingId);

  return {
    code: 'ok',
    data: {
      track: {
        id: updated.id,
        recordingId: updated.recording_id,
        finalSeq: updated.final_seq ?? 0,
        captureClosedAt: updated.capture_closed_at?.toISOString(),
        finalizeRequestedAt: updated.finalize_requested_at?.toISOString() ?? finalizeRequestedAt.toISOString(),
      },
    },
  };
}
