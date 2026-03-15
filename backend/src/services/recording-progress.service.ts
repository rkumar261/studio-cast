import { recording_status } from '@prisma/client';
import type {
  ConsumerRecordingState,
  GetRecordingProgressResponse,
  ParticipantUploadProgressDto,
} from '../dto/recordings/progress.dto.js';
import { prisma } from '../lib/prisma.js';
import type { RequestPrincipal } from '../lib/request-principal.js';
import { REQUIRED_EXPORT_TYPES } from './recording-readiness.service.js';
import { listParticipantMasterStatesForRecording } from './participant-asset.service.js';
import {
  computeTrackSequenceMetrics,
  evaluateTrackStitchReadiness,
  evaluateTrackUploadCompleteness,
} from './track-contiguity.service.js';

type ServiceResult<T> =
  | { code: 'ok'; data: T }
  | { code: 'not_found' }
  | { code: 'forbidden' };

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toParticipantBlockedReason(reason?: string): string | undefined {
  if (reason === 'not_finalized' || reason === 'invalid_final_seq') {
    return 'Finish recording on this device before leaving the page.';
  }
  if (reason === 'missing_chunks') {
    return 'Some upload data is still missing from this participant.';
  }
  if (reason === 'chunks_not_uploaded') {
    return 'Upload is still in progress for this participant.';
  }
  return undefined;
}

function deriveProjectState(input: {
  recordingStatus: recording_status;
  studioState: ConsumerRecordingState;
  hasParticipantAssetsPending: boolean;
  hasParticipantAssetsFailed: boolean;
  hasCombinedAssetPending: boolean;
  hasCombinedAssetFailed: boolean;
  requiredExportsFailed: number;
  requiredExportsPending: number;
}): ConsumerRecordingState {
  if (
    input.recordingStatus === recording_status.error ||
    input.hasParticipantAssetsFailed ||
    input.hasCombinedAssetFailed ||
    input.requiredExportsFailed > 0
  ) {
    return 'action required';
  }
  if (input.recordingStatus === recording_status.ready) {
    return 'ready';
  }
  if (input.studioState !== 'upload complete') {
    return input.studioState === 'recording' ? 'recording' : 'uploading';
  }
  if (
    input.recordingStatus === recording_status.processing ||
    input.hasParticipantAssetsPending ||
    input.hasCombinedAssetPending ||
    input.requiredExportsPending > 0
  ) {
    return 'processing';
  }
  return 'processing';
}

export async function getRecordingProgressService(args: {
  recordingId: string;
  principal: RequestPrincipal;
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
        },
      },
      combined_asset: {
        orderBy: { updated_at: 'desc' },
        take: 1,
        select: {
          id: true,
          state: true,
          failure_reason: true,
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
              storage_key_raw: true,
              final_seq: true,
              capture_closed_at: true,
              track_chunk: {
                orderBy: { seq: 'asc' },
                select: {
                  seq: true,
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
  if (args.principal.kind === 'user') {
    if (recording.userId && recording.userId !== args.principal.userId) return { code: 'forbidden' };
  } else {
    if (args.principal.recordingId !== args.recordingId) return { code: 'forbidden' };
    const isInvitedGuest = recording.participant.some((participant) => participant.id === args.principal.participantId);
    if (!isInvitedGuest) return { code: 'forbidden' };
  }

  const participantMasterStates = await listParticipantMasterStatesForRecording(recording.id);
  const applicableParticipantMasters = participantMasterStates.filter((participant) => participant.isApplicable);

  const participants: ParticipantUploadProgressDto[] = recording.participant.map((participant) => {
    const internalTracks = participant.track.map((track) => {
      const sequenceMetrics = computeTrackSequenceMetrics({
        chunks: track.track_chunk,
        finalSeq: track.final_seq,
        captureClosedAt: track.capture_closed_at,
      });
      const completeness = evaluateTrackUploadCompleteness({
        chunks: track.track_chunk,
        finalSeq: track.final_seq,
        captureClosedAt: track.capture_closed_at,
      });
      const stitchReadiness = evaluateTrackStitchReadiness({
        storageKeyRaw: track.storage_key_raw,
        chunks: track.track_chunk,
        finalSeq: track.final_seq,
        captureClosedAt: track.capture_closed_at,
      });

      return {
        uploaded:
          track.state === 'uploaded' ||
          track.state === 'processed' ||
          completeness.complete,
        blockedReason: stitchReadiness.reason,
        finalized: sequenceMetrics.finalized,
      };
    });

    const trackCount = internalTracks.length;
    const uploadedCount = internalTracks.filter((track) => track.uploaded).length;
    const hasFinalizeIssue = internalTracks.some(
      (track) => track.blockedReason === 'not_finalized' || track.blockedReason === 'invalid_final_seq'
    );
    const hasUploadGap = internalTracks.some(
      (track) => track.blockedReason === 'missing_chunks' || track.blockedReason === 'chunks_not_uploaded'
    );
    const blockedReason = hasFinalizeIssue
      ? toParticipantBlockedReason('not_finalized')
      : hasUploadGap
        ? toParticipantBlockedReason('chunks_not_uploaded')
        : undefined;

    let state: ConsumerRecordingState;
    if (!recording.stopped_at) {
      state = 'recording';
    } else if (hasFinalizeIssue) {
      state = 'action required';
    } else if (trackCount > 0 && uploadedCount < trackCount) {
      state = 'uploading';
    } else {
      state = 'upload complete';
    }

    const progressPct =
      !recording.stopped_at
        ? 0
        : trackCount === 0
          ? 100
          : clampPercent((uploadedCount / trackCount) * 100);

    return {
      participantId: participant.id,
      role: participant.role,
      displayName: participant.display_name ?? undefined,
      state,
      progressPct,
      blockedReason,
    };
  });

  const participantsTotal = participants.length;
  const participantsComplete = participants.filter((participant) => participant.state === 'upload complete').length;
  const participantsUploading = participants.filter((participant) => participant.state === 'uploading').length;
  const actionRequiredParticipants = participants.filter((participant) => participant.state === 'action required').length;

  let studioState: ConsumerRecordingState;
  if (!recording.stopped_at && recording.started_at) {
    studioState = 'recording';
  } else if (actionRequiredParticipants > 0) {
    studioState = 'action required';
  } else if (participantsTotal > 0 && participantsComplete < participantsTotal) {
    studioState = 'uploading';
  } else if (recording.stopped_at) {
    studioState = 'upload complete';
  } else {
    studioState = 'recording';
  }

  const requiredExports = REQUIRED_EXPORT_TYPES.map((requiredType) => {
    const row = recording.export_artifact.find((artifact) => artifact.type === requiredType);
    return row?.state ?? 'missing';
  });
  const requiredExportsFailed = requiredExports.filter((state) => state === 'failed').length;
  const requiredExportsPending = requiredExports.filter((state) => state !== 'succeeded' && state !== 'failed').length;

  const hasParticipantAssetsPending = applicableParticipantMasters.some(
    (participant) => participant.state === 'pending' || participant.state === 'processing'
  );
  const hasParticipantAssetsFailed = applicableParticipantMasters.some((participant) => participant.state === 'failed');
  const combinedAsset = recording.combined_asset[0];
  const hasCombinedAssetFailed = combinedAsset?.state === 'failed';
  const hasCombinedAssetPending =
    applicableParticipantMasters.length > 0 &&
    !hasParticipantAssetsPending &&
    !hasParticipantAssetsFailed &&
    (!combinedAsset || combinedAsset.state === 'pending' || combinedAsset.state === 'processing');

  const projectState = deriveProjectState({
    recordingStatus: recording.status,
    studioState,
    hasParticipantAssetsPending,
    hasParticipantAssetsFailed,
    hasCombinedAssetPending,
    hasCombinedAssetFailed: !!hasCombinedAssetFailed,
    requiredExportsFailed,
    requiredExportsPending,
  });

  const data: GetRecordingProgressResponse = {
    recordingId: recording.id,
    studioState,
    projectState,
    session: {
      startedAt: recording.started_at?.toISOString(),
      stoppedAt: recording.stopped_at?.toISOString(),
      hostParticipantId: recording.host_participant_id ?? undefined,
      controlVersion: recording.control_version,
    },
    studio: {
      canOpenProject:
        studioState === 'upload complete' ||
        projectState === 'processing' ||
        projectState === 'ready' ||
        projectState === 'action required',
      keepPageOpen: studioState === 'uploading' || studioState === 'action required',
    },
    summary: {
      participantsTotal,
      participantsComplete,
      participantsUploading,
      actionRequiredParticipants,
    },
    participants,
  };

  return { code: 'ok', data };
}
