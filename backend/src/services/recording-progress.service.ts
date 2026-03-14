import { export_type, recording_status } from '@prisma/client';
import type {
  GetRecordingProgressResponse,
  RecordingProgressBlockedReason,
  RecordingProgressPhase,
  TrackProgressBlockedReason,
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

function mapTrackBlockedReason(reason: string): TrackProgressBlockedReason | undefined {
  if (reason === 'not_finalized') return 'track_not_finalized';
  if (reason === 'invalid_final_seq') return 'invalid_final_seq';
  if (reason === 'missing_chunks') return 'missing_chunks';
  if (reason === 'chunks_not_uploaded') return 'chunks_pending_upload';
  if (reason === 'already_stitched') return 'already_stitched';
  return undefined;
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
          created_at: true,
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
                  storage_key_raw: true,
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
    const guestPrincipal = args.principal;
    if (guestPrincipal.recordingId !== args.recordingId) return { code: 'forbidden' };
    const isInvitedGuest = recording.participant.some((participant) => participant.id === guestPrincipal.participantId);
    if (!isInvitedGuest) return { code: 'forbidden' };
  }

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
      const sequenceMetrics = computeTrackSequenceMetrics({
        chunks,
        finalSeq: track.final_seq,
        captureClosedAt: track.capture_closed_at,
      });
      const chunkTotal = sequenceMetrics.expectedTotal ?? chunks.length;
      const chunkUploaded = chunks.filter((chunk) => chunk.state === 'uploaded').length;
      const chunkPending = Math.max(chunkTotal - chunkUploaded, 0);
      const completeness = evaluateTrackUploadCompleteness({
        chunks,
        finalSeq: track.final_seq,
        captureClosedAt: track.capture_closed_at,
      });
      const stitchReadiness = evaluateTrackStitchReadiness({
        storageKeyRaw: track.storage_key_raw,
        chunks,
        finalSeq: track.final_seq,
        captureClosedAt: track.capture_closed_at,
      });
      const blockedReason = mapTrackBlockedReason(stitchReadiness.reason);
      const readyForStitch = stitchReadiness.ready;
      const isFinalized = sequenceMetrics.finalized;

      let uploadState = latestUpload?.state ?? 'pending';
      if (track.state === 'processed' || blockedReason === 'already_stitched') {
        uploadState = 'stitched';
      } else if (readyForStitch) {
        uploadState = 'ready_for_stitch';
      } else if (blockedReason === 'track_not_finalized' || blockedReason === 'invalid_final_seq') {
        uploadState = 'waiting_finalization';
      } else if (blockedReason === 'missing_chunks') {
        uploadState = 'blocked_missing_chunks';
      } else if (blockedReason === 'chunks_pending_upload') {
        uploadState = 'in_progress';
      } else if (hasChunks) {
        uploadState = chunkPending === 0 ? 'completed' : 'in_progress';
      }

      if (uploadState === 'ready_for_stitch' || uploadState === 'completed' || uploadState === 'stitched') {
        summary.uploadsCompleted += 1;
      } else {
        summary.uploadsInProgress += 1;
      }

      summary.bytesReceived += bytesReceived;
      summary.tracksTotal += 1;
      summary.chunksTotal += chunkTotal;
      summary.chunksUploaded += chunkUploaded;
      summary.chunksPending += chunkPending;

      const isTrackUploaded =
        track.state === 'uploaded' ||
        track.state === 'processed' ||
        completeness.complete;

      if (isTrackUploaded) summary.tracksUploaded += 1;
      if (track.state === 'processed') summary.tracksProcessed += 1;

      return {
        trackId: track.id,
        kind: track.kind,
        state: track.state,
        uploadState,
        blockedReason,
        protocol: (chunks[0]?.protocol ?? latestUpload?.protocol) as 'tus' | 'multipart' | undefined,
        isFinalized,
        finalSeq: track.final_seq ?? undefined,
        readyForStitch,
        bytesReceived,
        chunkTotal,
        chunkUploaded,
        chunkPending,
        expectedTotal: sequenceMetrics.expectedTotal ?? undefined,
        highestSeq: sequenceMetrics.highestSeq,
        highestContiguousSeq: sequenceMetrics.highestContiguousSeq,
        missingSeqs: sequenceMetrics.missingSeqs,
        updatedAt: (hasChunks ? chunks[chunks.length - 1]?.updated_at : latestUpload?.updated_at)?.toISOString(),
      };
    });

    const uploadedCount = tracks.filter((track) => {
      if (track.state === 'processed') return true;
      return track.readyForStitch || (track.chunkTotal > 0 && track.chunkPending === 0 && !track.blockedReason);
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
  const phase = derivePhase({
    status: recording.status,
    startedAt: recording.started_at,
    stoppedAt: recording.stopped_at,
  });

  const allTracks = participants.flatMap((participant) => participant.tracks);
  const hasTrackNotFinalized = allTracks.some((track) => track.blockedReason === 'track_not_finalized');
  const hasInvalidFinalSeq = allTracks.some((track) => track.blockedReason === 'invalid_final_seq');
  const hasMissingChunks = allTracks.some((track) => track.blockedReason === 'missing_chunks');
  const hasChunksPendingUpload = allTracks.some((track) => track.blockedReason === 'chunks_pending_upload');
  const participantMasterStates = await listParticipantMasterStatesForRecording(recording.id);
  const applicableParticipantMasters = participantMasterStates.filter((participant) => participant.isApplicable);
  const hasParticipantAssetsPending = applicableParticipantMasters.some(
    (participant) => participant.state === 'pending' || participant.state === 'processing'
  );
  const hasParticipantAssetsFailed = applicableParticipantMasters.some(
    (participant) => participant.state === 'failed'
  );
  const combinedAsset = recording.combined_asset[0];
  const hasCombinedAssetFailed = combinedAsset?.state === 'failed';
  const hasCombinedAssetPending =
    applicableParticipantMasters.length > 0 &&
    !hasParticipantAssetsPending &&
    !hasParticipantAssetsFailed &&
    (!combinedAsset || combinedAsset.state === 'pending' || combinedAsset.state === 'processing');
  const exportsStageReached =
    !!combinedAsset &&
    combinedAsset.state === 'ready' &&
    !hasParticipantAssetsPending &&
    !hasParticipantAssetsFailed;

  const allTracksReadyOrStitched =
    allTracks.length > 0 &&
    allTracks.every(
      (track) =>
        track.readyForStitch ||
        track.state === 'processed' ||
        track.blockedReason === 'already_stitched'
    );
  const readyForStitch =
    !!recording.stopped_at &&
    allTracksReadyOrStitched &&
    recording.status !== recording_status.processing &&
    recording.status !== recording_status.ready &&
    recording.status !== recording_status.error;

  const readinessBlockedReasons = new Set<RecordingProgressBlockedReason>();
  if (phase === 'recording') readinessBlockedReasons.add('recording_active');
  if (hasTrackNotFinalized) readinessBlockedReasons.add('tracks_not_finalized');
  if (hasInvalidFinalSeq) readinessBlockedReasons.add('invalid_final_seq');
  if (hasMissingChunks) readinessBlockedReasons.add('missing_chunks');
  if (hasChunksPendingUpload) readinessBlockedReasons.add('chunks_pending_upload');
  if (readyForStitch) readinessBlockedReasons.add('ready_for_stitch');
  if (phase === 'processing') readinessBlockedReasons.add('stitching_in_progress');
  if (hasParticipantAssetsPending) readinessBlockedReasons.add('participant_assets_pending');
  if (hasParticipantAssetsFailed) readinessBlockedReasons.add('participant_assets_failed');
  if (hasCombinedAssetPending) readinessBlockedReasons.add('combined_asset_pending');
  if (hasCombinedAssetFailed) readinessBlockedReasons.add('combined_asset_failed');
  if (requiredFailed > 0) readinessBlockedReasons.add('exports_failed');
  if (exportsStageReached && requiredPending > 0) readinessBlockedReasons.add('exports_pending');

  const readinessReasonOrder: RecordingProgressBlockedReason[] = [
    'recording_active',
    'tracks_not_finalized',
    'invalid_final_seq',
    'missing_chunks',
    'chunks_pending_upload',
    'ready_for_stitch',
    'stitching_in_progress',
    'participant_assets_pending',
    'participant_assets_failed',
    'combined_asset_pending',
    'combined_asset_failed',
    'exports_pending',
    'exports_failed',
  ];
  const orderedReadinessReasons = readinessReasonOrder.filter((reason) =>
    readinessBlockedReasons.has(reason)
  );

  const data: GetRecordingProgressResponse = {
    recordingId: recording.id,
    status: recording.status,
    phase,
    readiness: {
      readyForStitch,
      blockedReasons: orderedReadinessReasons,
    },
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
