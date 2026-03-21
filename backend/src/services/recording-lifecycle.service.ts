import { prisma } from '../lib/prisma.js';
import {
  normalizeRecordingLifecycleState,
  normalizeTrackLifecycleState,
} from '../lib/lifecycle-state.js';
import type { RecordingLifecycleDiagnosticsResponse } from '../dto/recordings/lifecycle-diagnostics.dto.js';
import {
  computeTrackSequenceMetrics,
  evaluateTrackStitchReadiness,
} from './track-contiguity.service.js';

type ServiceResult<T> =
  | { code: 'ok'; data: T }
  | { code: 'not_found' }
  | { code: 'forbidden' };

export async function getRecordingLifecycleDiagnosticsService(args: {
  recordingId: string;
  requesterId: string;
}): Promise<ServiceResult<RecordingLifecycleDiagnosticsResponse>> {
  const recording = await prisma.recording.findUnique({
    where: { id: args.recordingId },
    select: {
      id: true,
      userId: true,
      status: true,
      lifecycle_state: true,
      started_at: true,
      stopped_at: true,
      upload_completed_at: true,
      processing_started_at: true,
      ready_at: true,
      failed_at: true,
      failure_reason: true,
      track: {
        orderBy: [{ participant_id: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          participant_id: true,
          kind: true,
          state: true,
          lifecycle_state: true,
          final_seq: true,
          capture_closed_at: true,
          finalized_at: true,
          ingest_ready_at: true,
          stitched_at: true,
          transcoded_at: true,
          ready_at: true,
          failed_at: true,
          failure_reason: true,
          storage_key_raw: true,
          storage_key_final: true,
          track_chunk: {
            orderBy: { seq: 'asc' },
            select: {
              seq: true,
              state: true,
              storage_key_raw: true,
            },
          },
        },
      },
    },
  });

  if (!recording) return { code: 'not_found' };
  if (recording.userId && recording.userId !== args.requesterId) return { code: 'forbidden' };

  return {
    code: 'ok',
    data: {
      recording: {
        id: recording.id,
        status: recording.status,
        lifecycleState: recording.lifecycle_state,
        canonicalLifecycleState: normalizeRecordingLifecycleState({
          lifecycleState: recording.lifecycle_state,
          status: recording.status,
          startedAt: recording.started_at,
          stoppedAt: recording.stopped_at,
          uploadCompletedAt: recording.upload_completed_at,
        }),
        startedAt: recording.started_at?.toISOString(),
        stoppedAt: recording.stopped_at?.toISOString(),
        uploadCompletedAt: recording.upload_completed_at?.toISOString(),
        processingStartedAt: recording.processing_started_at?.toISOString(),
        readyAt: recording.ready_at?.toISOString(),
        failedAt: recording.failed_at?.toISOString(),
        failureReason: recording.failure_reason ?? undefined,
      },
      tracks: recording.track.map((track) => {
        const metrics = computeTrackSequenceMetrics({
          chunks: track.track_chunk,
          finalSeq: track.final_seq,
          captureClosedAt: track.capture_closed_at,
        });
        const readiness = evaluateTrackStitchReadiness({
          storageKeyRaw: track.storage_key_raw,
          chunks: track.track_chunk,
          finalSeq: track.final_seq,
          captureClosedAt: track.capture_closed_at,
        });

        return {
          id: track.id,
          participantId: track.participant_id,
          kind: track.kind,
          state: track.state,
          lifecycleState: track.lifecycle_state,
          canonicalLifecycleState: normalizeTrackLifecycleState({
            lifecycleState: track.lifecycle_state,
            state: track.state,
            captureClosedAt: track.capture_closed_at,
            finalSeq: track.final_seq,
            storageKeyRaw: track.storage_key_raw,
            storageKeyFinal: track.storage_key_final,
            failureReason: track.failure_reason,
          }),
          finalSeq: track.final_seq ?? undefined,
          highestExistingSeq: metrics.highestSeq,
          highestContiguousUploadedSeq: metrics.highestContiguousSeq,
          missingSeqs: metrics.missingSeqs,
          blockedReason:
            readiness.ready || readiness.reason === 'already_stitched'
              ? track.failure_reason ?? undefined
              : readiness.reason,
          captureClosedAt: track.capture_closed_at?.toISOString(),
          finalizedAt: track.finalized_at?.toISOString(),
          ingestReadyAt: track.ingest_ready_at?.toISOString(),
          stitchedAt: track.stitched_at?.toISOString(),
          transcodedAt: track.transcoded_at?.toISOString(),
          readyAt: track.ready_at?.toISOString(),
          failedAt: track.failed_at?.toISOString(),
          failureReason: track.failure_reason ?? undefined,
        };
      }),
    },
  };
}
