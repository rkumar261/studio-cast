import type { HostStudioPhase } from '@/lib/recording-journey';
import { toConsumerStateLabel } from '@/lib/recording-journey';
import type {
  ConsumerRecordingState,
  RecordingParticipantProgressDto,
} from '@/lib/recordings.api';
import {
  buildStudioCanvasLayout,
  type StudioPeerSummary,
} from '@/lib/studio/stage-view-model';
import type { StudioConnectionStatus } from '@/lib/studio/useStudioConnectionCoordinator';

type ChunkUploadStats = {
  pending: number;
  processing: number;
  failed: number;
  bytesProcessing: number;
  bytesUploaded: number;
  bytesTotal: number;
};

type StudioActiveViewState = Parameters<typeof buildStudioCanvasLayout>[0]['active'] & {
  status: StudioConnectionStatus;
  isCameraEnabled: boolean;
  peers: StudioPeerSummary[];
};

type StudioSidebarPerson = {
  id: string;
  label: string;
  role: string;
  percent: number;
  note: string;
  showProgressBar: boolean;
};

type RecordingUploadSummary = {
  participantsTotal: number;
  participantsComplete: number;
  participantsUploading: number;
  actionRequiredParticipants: number;
};

type BuildStudioRouteViewModelArgs = {
  displayName: string;
  active: StudioActiveViewState;
  studioLayoutMode: 'grid' | 'screen_share_dominant';
  progressParticipants: RecordingParticipantProgressDto[];
  recorderParticipantId?: string | null;
  effectiveRequestedParticipantId?: string | null;
  isRecording: boolean;
  localStudioRole: 'host' | 'guest';
  localStudioRoleLabel: string;
  localQueueState: ConsumerRecordingState;
  localUploadComplete: boolean;
  hasPendingUploads: boolean;
  canOpenProject: boolean;
  hostStudioLifecyclePhase: HostStudioPhase | null;
  recordingSessionStartedAt?: string;
  recordingSessionStoppedAt?: string;
  showStudioPeoplePanel: boolean;
  uploadOverlayOpen: boolean;
  showUploadStatusModal: boolean;
  uploadCompletion: {
    participantsTotal: number;
    participantsComplete: number;
    participantsUploading: number;
    actionRequiredParticipants: number;
    keepPageOpen: boolean;
  };
  chunkUploadStats: ChunkUploadStats;
};

type BuildMeetHeaderViewModelArgs = {
  status: StudioConnectionStatus;
  participantCount: number;
  showPeoplePanel: boolean;
  stageFit: 'contain' | 'cover';
  showSelfPreview: boolean;
  selfPreviewExpanded: boolean;
};

function mapStudioProgressPeople(
  progressParticipants: RecordingParticipantProgressDto[]
): StudioSidebarPerson[] {
  return progressParticipants.map((participant) => {
    const percent = participant.progressPct;
    return {
      id: participant.participantId,
      label: participant.displayName || participant.participantId.slice(0, 8),
      role: participant.role === 'host' ? 'Host' : 'Guest',
      percent,
      note: participant.blockedReason ?? toConsumerStateLabel(participant.state),
      showProgressBar: participant.state !== 'recording' || percent > 0,
    };
  });
}

function buildFallbackPeople(args: {
  displayName: string;
  localStudioRoleLabel: string;
  isRecording: boolean;
  peers: StudioPeerSummary[];
}): StudioSidebarPerson[] {
  return [
    {
      id: 'local',
      label: args.displayName || 'You',
      role: args.localStudioRoleLabel,
      percent: 0,
      note: args.isRecording ? 'Recording...' : 'Waiting for upload...',
      showProgressBar: !args.isRecording,
    },
    ...args.peers.map((peer) => ({
      id: peer.id,
      label: peer.label,
      role: 'Guest',
      percent: 0,
      note: 'Connected',
      showProgressBar: false,
    })),
  ];
}

function buildUploadChipLabel(args: {
  localStudioRole: 'host' | 'guest';
  isRecording: boolean;
  hasLiveUploadActivity: boolean;
  uploadedPercent: number;
  hostStudioLifecyclePhase: HostStudioPhase | null;
  recordingSessionStoppedAt?: string;
  canOpenProject: boolean;
  localQueueState: ConsumerRecordingState;
}): string | null {
  if (args.localStudioRole === 'guest') {
    return args.localQueueState === 'action required'
      ? 'Action required'
      : `↑ ${args.uploadedPercent}% Uploading...`;
  }

  if (args.isRecording && args.hasLiveUploadActivity) {
    return `↑ ${args.uploadedPercent}% Uploading...`;
  }
  if (args.hostStudioLifecyclePhase === 'stop_requested') return 'Stopping...';
  if (args.hostStudioLifecyclePhase === 'uploading_after_stop') {
    return `↑ ${args.uploadedPercent}% Uploading...`;
  }
  if (args.hostStudioLifecyclePhase === 'studio_upload_complete') return '✓ Upload complete';
  if (args.hostStudioLifecyclePhase === 'project_processing') return '→ Processing';
  if (args.hostStudioLifecyclePhase === 'project_ready') return '✓ Ready';
  if (args.recordingSessionStoppedAt && !args.canOpenProject) {
    return `↑ ${args.uploadedPercent}% Uploading...`;
  }
  return null;
}

export function buildStudioRouteViewModel(args: BuildStudioRouteViewModelArgs) {
  const progressPeople = mapStudioProgressPeople(args.progressParticipants);
  const fallbackPeople = buildFallbackPeople({
    displayName: args.displayName,
    localStudioRoleLabel: args.localStudioRoleLabel,
    isRecording: args.isRecording,
    peers: args.active.peers,
  });
  const stageLayout = buildStudioCanvasLayout({
    displayName: args.displayName,
    active: args.active,
    studioLayoutMode: args.studioLayoutMode,
  });
  const queueUploadedPercent =
    args.chunkUploadStats.bytesTotal === 0
      ? 0
      : Math.min(
          100,
          Math.round(
            ((args.chunkUploadStats.bytesUploaded + args.chunkUploadStats.bytesProcessing) * 100) /
              args.chunkUploadStats.bytesTotal
          )
        );
  const progressUploadedPercent =
    args.progressParticipants.length > 0
      ? Math.round(
          args.progressParticipants.reduce((sum, participant) => sum + participant.progressPct, 0) /
            args.progressParticipants.length
        )
      : null;
  const uploadedPercent = Math.max(progressUploadedPercent ?? 0, queueUploadedPercent);
  const hasLiveUploadActivity =
    args.chunkUploadStats.pending > 0 ||
    args.chunkUploadStats.processing > 0 ||
    args.chunkUploadStats.failed > 0 ||
    uploadedPercent > 0;
  const localParticipantId = args.recorderParticipantId ?? args.effectiveRequestedParticipantId;
  const liveParticipantIds = new Set(args.active.peers.map((peer) => peer.id));
  const remoteProgressParticipants = args.progressParticipants.filter(
    (participant) =>
      (localParticipantId
        ? participant.participantId !== localParticipantId
        : participant.role !== 'host') &&
      (args.isRecording ? liveParticipantIds.has(participant.participantId) : true)
  );
  const livePeopleForPanel: StudioSidebarPerson[] = [
    {
      id: 'local-live',
      label: args.displayName || 'You',
      role: args.localStudioRoleLabel,
      percent: uploadedPercent,
      note:
        args.isRecording && !hasLiveUploadActivity
          ? 'Recording...'
          : hasLiveUploadActivity
            ? `${uploadedPercent}% uploaded${args.isRecording ? ' (recording)' : ''}`
            : 'Waiting...',
      showProgressBar: hasLiveUploadActivity,
    },
    ...(remoteProgressParticipants.length > 0
      ? remoteProgressParticipants.map((participant) => {
          const isParticipantRecording = participant.state === 'recording';
          return {
            id: participant.participantId,
            label: participant.displayName || participant.participantId.slice(0, 8),
            role: participant.role === 'host' ? 'Host' : 'Guest',
            percent: participant.progressPct,
            note:
              isParticipantRecording && participant.progressPct === 0
                ? 'Recording...'
                : participant.progressPct > 0
                  ? `${participant.progressPct}% uploaded${
                      isParticipantRecording ? ' (recording)' : ''
                    }`
                  : participant.blockedReason ?? toConsumerStateLabel(participant.state),
            showProgressBar: participant.progressPct > 0,
          };
        })
      : args.active.peers.map((peer) => ({
          id: peer.id,
          label: peer.label,
          role: 'Guest',
          percent: 0,
          note: 'Connected',
          showProgressBar: false,
        }))),
  ];
  const peopleForPanel = !args.recordingSessionStoppedAt
    ? livePeopleForPanel
    : progressPeople.length > 0
      ? progressPeople
      : fallbackPeople.map((person, index) =>
          index === 0
            ? {
                ...person,
                percent: uploadedPercent,
                note: `${uploadedPercent}% uploaded`,
                showProgressBar: uploadedPercent > 0,
              }
            : person
        );

  const hostShouldShowUploadChip =
    (args.isRecording && hasLiveUploadActivity) ||
    (args.hostStudioLifecyclePhase !== null &&
      args.hostStudioLifecyclePhase !== 'recording_active') ||
    (!!args.recordingSessionStoppedAt && !args.canOpenProject);
  const showUploadChip =
    args.localStudioRole === 'host'
      ? hostShouldShowUploadChip
      : args.isRecording ||
        args.hasPendingUploads ||
        (!!args.recordingSessionStoppedAt && !args.localUploadComplete);
  const uploadChipLabel = buildUploadChipLabel({
    localStudioRole: args.localStudioRole,
    isRecording: args.isRecording,
    hasLiveUploadActivity,
    uploadedPercent,
    hostStudioLifecyclePhase: args.hostStudioLifecyclePhase,
    recordingSessionStoppedAt: args.recordingSessionStoppedAt,
    canOpenProject: args.canOpenProject,
    localQueueState: args.localQueueState,
  });
  const recordingSeconds = args.recordingSessionStartedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(args.recordingSessionStartedAt).getTime()) / 1000))
    : 0;

  const uploadSummary: RecordingUploadSummary | undefined =
    args.uploadCompletion.participantsTotal > 0
      ? {
          participantsTotal: args.uploadCompletion.participantsTotal,
          participantsComplete: args.uploadCompletion.participantsComplete,
          participantsUploading: args.uploadCompletion.participantsUploading,
          actionRequiredParticipants: args.uploadCompletion.actionRequiredParticipants,
        }
      : undefined;

  return {
    ...stageLayout,
    peopleForPanel,
    showUploadChip,
    uploadChipLabel,
    recordingClock: `${String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:${String(
      recordingSeconds % 60
    ).padStart(2, '0')}`,
    isMicOff: !args.active.isMicEnabled,
    isCamOff: !args.active.isCameraEnabled,
    shouldReserveUploadBarSpace: args.localStudioRole === 'host' && args.uploadOverlayOpen,
    floatingUploadLayout: {
      leftInset: 54,
      rightInset: args.showStudioPeoplePanel ? 510 : 170,
      bottomInset: 150,
    },
    uploadSummary,
    uploadKeepPageOpenHint:
      args.localStudioRole === 'host'
        ? args.uploadCompletion.keepPageOpen
        : args.showUploadStatusModal,
    uploadCanDismiss:
      args.localStudioRole === 'host'
        ? args.hostStudioLifecyclePhase === 'studio_upload_complete' ||
          args.hostStudioLifecyclePhase === 'project_processing' ||
          args.hostStudioLifecyclePhase === 'project_ready'
        : true,
  };
}

export function buildMeetHeaderViewModel(args: BuildMeetHeaderViewModelArgs) {
  return {
    statusLabel:
      args.status === 'idle'
        ? 'Not connected'
        : args.status === 'connecting'
          ? 'Connecting'
          : args.status === 'reconnecting'
            ? 'Reconnecting'
            : args.status === 'connected'
              ? 'Live'
              : 'Error',
    participantCount: args.participantCount,
    fitLabel: args.stageFit === 'contain' ? 'Fill screen' : 'Fit screen',
    showPeopleLabel: args.showPeoplePanel ? 'Hide people' : 'Show people',
    selfPreviewLabel: args.showSelfPreview ? 'Hide self' : 'Show self',
    showSelfPreviewSizeAction: args.showSelfPreview,
    selfPreviewSizeLabel: args.selfPreviewExpanded ? 'Minimize self' : 'Maximize self',
  };
}
