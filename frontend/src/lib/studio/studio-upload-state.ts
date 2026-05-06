import { deriveGuestUploadState, deriveHostStudioPhase } from '@/lib/recording-journey';
import type {
  ConsumerRecordingState,
  RecordingParticipantProgressDto,
  RecordingProgressResponse,
} from '@/lib/recordings.api';

type ChunkUploadStats = {
  pending: number;
  processing: number;
  failed: number;
};

type UploadCompletion = {
  participantsTotal: number;
  participantsComplete: number;
  participantsUploading: number;
  actionRequiredParticipants: number;
  keepPageOpen: boolean;
  uploadsComplete: boolean;
};

type DeriveStudioUploadStateArgs = {
  progressParticipants: RecordingParticipantProgressDto[];
  recordingProgress: RecordingProgressResponse | null;
  recordingSessionStoppedAt?: string;
  isRecording: boolean;
  localStudioRole: 'host' | 'guest';
  showPreJoin: boolean;
  sessionBusy: boolean;
  recorderParticipantId?: string | null;
  effectiveRequestedParticipantId?: string | null;
  chunkUploadStats: ChunkUploadStats;
};

export function deriveStudioUploadState(args: DeriveStudioUploadStateArgs) {
  const localParticipantProgress = args.progressParticipants.find((participant) =>
    args.recorderParticipantId
      ? participant.participantId === args.recorderParticipantId
      : args.effectiveRequestedParticipantId
        ? participant.participantId === args.effectiveRequestedParticipantId
        : participant.role === 'host'
  );

  const localQueueState = deriveGuestUploadState({
    pendingUploads: args.chunkUploadStats.pending + args.chunkUploadStats.processing,
    failedUploads: args.chunkUploadStats.failed,
  });

  const localUploadComplete = localParticipantProgress
    ? localParticipantProgress.state === 'upload complete'
    : localQueueState === 'upload complete';

  const participantsWithUploads = args.progressParticipants;
  const hasBackendPendingUploads = participantsWithUploads.some(
    (participant) => participant.state === 'uploading'
  );
  const hasLocalPendingUploads =
    args.chunkUploadStats.pending > 0 || args.chunkUploadStats.processing > 0;
  const uploadCompletion: UploadCompletion = {
    participantsTotal:
      args.recordingProgress?.summary.participantsTotal ?? participantsWithUploads.length,
    participantsComplete:
      args.recordingProgress?.summary.participantsComplete ??
      participantsWithUploads.filter((participant) => participant.state === 'upload complete').length,
    participantsUploading:
      args.recordingProgress?.summary.participantsUploading ??
      participantsWithUploads.filter((participant) => participant.state === 'uploading').length,
    actionRequiredParticipants:
      args.recordingProgress?.summary.actionRequiredParticipants ??
      participantsWithUploads.filter((participant) => participant.state === 'action required').length,
    keepPageOpen:
      args.recordingProgress?.studio.keepPageOpen ?? (hasLocalPendingUploads || hasBackendPendingUploads),
    uploadsComplete:
      args.recordingProgress?.studio.canOpenProject ??
      (!!args.recordingSessionStoppedAt &&
        (args.recordingProgress?.summary.participantsTotal ?? participantsWithUploads.length) > 0 &&
        (args.recordingProgress?.summary.participantsComplete ??
          participantsWithUploads.filter((participant) => participant.state === 'upload complete').length) >=
          (args.recordingProgress?.summary.participantsTotal ?? participantsWithUploads.length)),
  };

  const canOpenProject =
    args.recordingProgress?.studio.canOpenProject ?? uploadCompletion.uploadsComplete;
  const studioState: ConsumerRecordingState =
    args.recordingProgress?.studioState ??
    (args.isRecording ? 'recording' : canOpenProject ? 'upload complete' : 'uploading');
  const projectState: ConsumerRecordingState =
    args.recordingProgress?.projectState ?? (canOpenProject ? 'processing' : studioState);

  const hostStudioLifecyclePhase = deriveHostStudioPhase({
    canControlRecording: args.localStudioRole === 'host',
    showPreJoin: args.showPreJoin,
    isRecording: args.isRecording,
    sessionBusy: args.sessionBusy,
    sessionStopped: !!args.recordingSessionStoppedAt,
    studioState,
    projectState,
  });

  const hostUploadOverlayOpen =
    args.localStudioRole === 'host' &&
    hostStudioLifecyclePhase !== null &&
    hostStudioLifecyclePhase !== 'host_prepared' &&
    hostStudioLifecyclePhase !== 'recording_active';

  const uploadStatusState: ConsumerRecordingState =
    args.localStudioRole === 'host'
      ? hostStudioLifecyclePhase === 'project_processing' || hostStudioLifecyclePhase === 'project_ready'
        ? projectState
        : studioState
      : localParticipantProgress?.state ?? localQueueState;

  return {
    localParticipantProgress,
    localQueueState,
    localUploadComplete,
    uploadCompletion,
    hasPendingUploads: uploadCompletion.keepPageOpen,
    canOpenProject,
    studioState,
    projectState,
    hostStudioLifecyclePhase,
    hostUploadOverlayOpen,
    uploadStatusState,
  };
}
