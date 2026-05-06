'use client';

import React, { use, useEffect, useMemo, useRef, useState } from 'react';
import { Space_Grotesk } from 'next/font/google';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ParticipantsAPI,
  RecordingsAPI,
  setApiAuthMode,
} from '@/lib/api';
import { deriveStudioUiAccess } from '@/lib/studio/access';
import { buildMeetViewModel } from '@/lib/studio/stage-view-model';
import {
  buildMeetHeaderViewModel,
  buildStudioRouteViewModel,
} from '@/lib/studio/studio-page-view-model';
import { deriveStudioUploadState } from '@/lib/studio/studio-upload-state';
import { useChunkUploadQueue, type ChunkUploadProtocol } from '@/lib/studio/useChunkUploadQueue';
import { useStudioConnectionCoordinator } from '@/lib/studio/useStudioConnectionCoordinator';
import { useStudioDevices } from '@/lib/studio/useStudioDevices';
import { useStudioInviteControls } from '@/lib/studio/useStudioInviteControls';
import { useMeetStageUi } from '@/lib/studio/useMeetStageUi';
import { useStudioRecording } from '@/lib/studio/useStudioRecording';
import { useStudioSessionState } from '@/lib/studio/useStudioSessionState';
import { useStreamQualityProbe } from '@/lib/studio/useStreamQualityProbe';
import { useSession } from '@/lib/useSession';
import { StudioControlBar } from '@/components/studio/StudioControlBar';
import { StudioInviteModal } from '@/components/studio/StudioInviteModal';
import { StudioInviteSidePanel } from '@/components/studio/StudioInviteSidePanel';
import { StudioPeopleSidebar } from '@/components/studio/StudioPeopleSidebar';
import { StudioHeaderBar } from '@/components/studio/StudioHeaderBar';
import { StudioRetryUploadsButton } from '@/components/studio/StudioRetryUploadsButton';
import { StudioStageArea } from '@/components/studio/StudioStageArea';
import { StudioStatusBanners } from '@/components/studio/StudioStatusBanners';
import { MeetControlBar } from '@/components/studio/MeetControlBar';
import { MeetContextMenu } from '@/components/studio/MeetContextMenu';
import { MeetHeaderBar } from '@/components/studio/MeetHeaderBar';
import { MeetPeoplePanel } from '@/components/studio/MeetPeoplePanel';
import { MeetStageArea } from '@/components/studio/MeetStageArea';
import { MeetStatusBanners } from '@/components/studio/MeetStatusBanners';
import { StudioGuestWelcome } from '@/components/studio/StudioGuestWelcome';
import { StudioPreJoinSetup } from '@/components/studio/StudioPreJoinSetup';
import UploadStatusModal from '@/components/studio/UploadStatusModal';

type RouteParams = {
  recordingId: string;
};

type StudioPageProps = {
  params: Promise<RouteParams>;
};

type SessionMode = 'meet' | 'studio';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

export default function StudioRecordingPage({ params }: StudioPageProps) {
  const { recordingId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useSession();
  const sessionMode: SessionMode = searchParams.get('mode') === 'meet' ? 'meet' : 'studio';
  const requestedStudioRole = searchParams.get('role') === 'host'
    ? 'host'
    : searchParams.get('role') === 'guest'
      ? 'guest'
      : null;
  const requestedParticipantId = searchParams.get('participantId')?.trim() || null;
  const requestedGuestToken = searchParams.get('guestToken')?.trim() || null;
  const isGuestStudioFlow = sessionMode === 'studio' && requestedStudioRole === 'guest';

  const meshMaxPeers = Number(process.env.NEXT_PUBLIC_MESH_MAX_PEERS ?? '4');
  const allowStudioMeshFallback =
    String(process.env.NEXT_PUBLIC_STUDIO_ALLOW_MESH_FALLBACK ?? 'false') === 'true';

  const [pinnedTileKey, setPinnedTileKey] = useState<string | null>(null);
  const [showPreJoin, setShowPreJoin] = useState(sessionMode === 'studio');
  const [displayName, setDisplayName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPreJoinStep, setGuestPreJoinStep] = useState<'welcome' | 'prejoin'>(
    isGuestStudioFlow ? 'welcome' : 'prejoin'
  );
  const [guestJoinError, setGuestJoinError] = useState<string | null>(null);
  const [usingHeadphones, setUsingHeadphones] = useState(true);
  const [joiningFromPreJoin, setJoiningFromPreJoin] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [showStudioInvitePanel, setShowStudioInvitePanel] = useState(true);
  const [showStudioPeoplePanel, setShowStudioPeoplePanel] = useState(true);
  const [showAddParticipantPanel, setShowAddParticipantPanel] = useState(false);
  const [showUploadStatusModal, setShowUploadStatusModal] = useState(false);
  const [claimedGuestParticipantId, setClaimedGuestParticipantId] = useState<string | null>(null);
  const [guestClaimReady, setGuestClaimReady] = useState(
    !isGuestStudioFlow || !requestedGuestToken
  );
  // U1: stopped_uploading phase — room stays alive after stop until all leave or 10-min timeout
  const [stoppedUploadingPhase, setStoppedUploadingPhase] = useState(false);
  const dwellTimerRef = useRef<number | null>(null);

  // P3/U2: stream quality probe — detects black video / silent audio on join
  const { probe: probeStreamQuality, result: streamQualityResult } = useStreamQualityProbe();
  const streamWarning = streamQualityResult
    ? streamQualityResult.videoWarning === 'black_stream'
      ? '⚠ Your camera appears unavailable — your video will record as black. Close other apps using your camera, then refresh.'
      : streamQualityResult.audioWarning === 'no_audio_track'
        ? '⚠ No microphone detected — your recording will have no audio.'
        : null
    : null;
  const meetStageRef = useRef<HTMLDivElement | null>(null);
  const {
    showMeetSelfPreview,
    setShowMeetSelfPreview,
    meetSelfPreviewExpanded,
    setMeetSelfPreviewExpanded,
    meetStageFit,
    setMeetStageFit,
    showMeetPeoplePanel,
    setShowMeetPeoplePanel,
    showMeetViewMenu,
    setShowMeetViewMenu,
    meetContextMenu,
    openMeetContextMenu,
    closeMeetContextMenu,
    toggleMeetFullscreen,
  } = useMeetStageUi({
    stageRef: meetStageRef,
  });
  const chunkUploadProtocol: ChunkUploadProtocol = 'presigned_url';
  const chunkUploadQueue = useChunkUploadQueue({
    enabled: sessionMode === 'studio',
    recordingId,
    concurrency: 2,
    maxRetries: 8,
  });
  const hasLocalQueueWork =
    sessionMode === 'studio' &&
    (chunkUploadQueue.stats.pending > 0 || chunkUploadQueue.stats.processing > 0);
  const {
    recordingSession,
    setRecordingSession,
    recordingProgress,
    setRecordingProgress,
    canControlRecording,
    setCanControlRecording,
    sessionBusy,
    setSessionBusy,
    sessionError,
    setSessionError,
  } = useStudioSessionState({
    sessionMode,
    requestedStudioRole,
    recordingId,
    guestClaimReady,
    hasLocalQueueWork,
    stoppedUploadingPhase,
    showUploadStatusModal,
  });
  const isRecording = !!recordingSession?.startedAt && !recordingSession?.stoppedAt;
  const {
    inviteRole,
    setInviteRole,
    inviteEmail,
    setInviteEmail,
    inviteNotice,
    setInviteNotice,
    copyState,
    setCopyState,
    localHostParticipantId,
    createdInviteParticipantIdByRole,
    createdInviteGuestToken,
    inviteLink,
    ensureLocalHostParticipantId,
    handleCopyInviteLink,
    handleInviteByEmail,
  } = useStudioInviteControls({
    sessionMode,
    requestedStudioRole,
    recordingId,
    displayName,
    profileName: profile?.name,
    recordingSessionHostParticipantId: recordingSession?.hostParticipantId ?? null,
    onError: setSessionError,
  });

  useEffect(() => {
    if (sessionMode === 'studio' && requestedStudioRole === 'guest') {
      setApiAuthMode('guest');
      return () => setApiAuthMode('default');
    }
    setApiAuthMode('default');
    return () => setApiAuthMode('default');
  }, [requestedStudioRole, sessionMode]);

  useEffect(() => {
    if (sessionMode === 'studio') {
      setShowPreJoin(true);
    } else {
      setShowPreJoin(false);
    }
  }, [recordingId, sessionMode]);

  useEffect(() => {
    if (displayName) return;
    if (profile?.name?.trim()) {
      setDisplayName(profile.name.trim());
      return;
    }
    if (profile?.email) {
      setDisplayName(profile.email.split('@')[0]);
    }
  }, [displayName, profile?.email, profile?.name]);

  useEffect(() => {
    setClaimedGuestParticipantId(null);
    setGuestJoinError(null);
    setGuestEmail('');
    setGuestPreJoinStep(isGuestStudioFlow ? 'welcome' : 'prejoin');
    setGuestClaimReady(!isGuestStudioFlow || !requestedGuestToken);
    setShowStudioInvitePanel(true);
  }, [isGuestStudioFlow, recordingId, requestedGuestToken]);

  const shouldRunStudioPreJoinChecks =
    sessionMode === 'studio' && (!isGuestStudioFlow || guestPreJoinStep === 'prejoin');
  const {
    active,
    fallbackNotice,
    isConnected,
    join,
    leaveAndReset,
    recordingStreams,
    sessionStartedAt,
    studioLayoutMode,
    broadcastSessionStart,
    broadcastRemoveParticipant,
  } = useStudioConnectionCoordinator({
    recordingId,
    sessionMode,
    requestedStudioRole,
    meshMaxPeers,
    allowStudioMeshFallback,
    probeStreamQuality,
    onGuestRemoved: () => {
      router.replace(`/studio/${recordingId}/thanks`);
    },
  });

  const shouldMaintainPreJoinPreview =
    (sessionMode === 'studio' && showPreJoin && shouldRunStudioPreJoinChecks) ||
    (sessionMode === 'meet' && !isConnected);

  const {
    previewVideoRef: preJoinVideoRef,
    preJoinStatus,
    preJoinError,
    preJoinMicEnabled,
    preJoinCamEnabled,
    preJoinPreviewStream,
    cameraDevices,
    micDevices,
    speakerDevices,
    selectedCameraId,
    selectedMicId,
    selectedSpeakerId,
    setSelectedCameraId,
    setSelectedMicId,
    setSelectedSpeakerId,
    startPreJoinPreview,
    stopPreJoinPreview,
    togglePreJoinMic,
    togglePreJoinCam,
  } = useStudioDevices({
    previewEnabled: shouldMaintainPreJoinPreview,
  });

  const effectiveRequestedParticipantId =
    requestedStudioRole === 'guest' && requestedGuestToken
      ? claimedGuestParticipantId ?? requestedParticipantId
      : requestedParticipantId;

  const recorderParticipantId =
    requestedStudioRole === 'guest'
      ? effectiveRequestedParticipantId
      : recordingSession?.hostParticipantId ??
        localHostParticipantId ??
        createdInviteParticipantIdByRole.host ??
        null;
  const {
    recorderError,
    finalizeTrackCaptures,
    hasRegisteredTracks,
  } = useStudioRecording({
    sessionMode,
    requestedStudioRole,
    guestClaimReady,
    recordingId,
    recorderParticipantId,
    recordingStreams,
    isRecording,
    recordingSessionStartedAt: recordingSession?.startedAt,
    recordingSessionStoppedAt: recordingSession?.stoppedAt,
    sessionStartedAt,
    chunkUploadProtocol,
    chunkUploadQueue,
    resetKey: `${recordingId}:${requestedGuestToken ?? ''}:${isGuestStudioFlow ? 'guest' : 'default'}`,
  });

  useEffect(() => {
    if (!pinnedTileKey) return;
    const isRemotePinValid = active.tiles.some((tile) => tile.key === pinnedTileKey);
    const isStudioLocalPin =
      sessionMode === 'studio' &&
      (pinnedTileKey === 'studio-local-camera' || pinnedTileKey === 'studio-local-screen');
    const isMeetLocalPin =
      sessionMode === 'meet' &&
      (pinnedTileKey === 'meet-local-camera' || pinnedTileKey === 'meet-local-screen');
    if (!isRemotePinValid && !isMeetLocalPin && !isStudioLocalPin) {
      setPinnedTileKey(null);
    }
  }, [active.tiles, pinnedTileKey, sessionMode]);

  const {
    meetLocalTile,
    meetMainTile,
    hasRemoteStage,
    meetVisibleSecondaryTiles,
    meetPeople,
  } = useMemo(
    () =>
      buildMeetViewModel({
        displayName,
        active,
        preJoinPreviewStream,
        pinnedTileKey,
        showMeetSelfPreview,
      }),
    [active, displayName, pinnedTileKey, preJoinPreviewStream, showMeetSelfPreview]
  );
  const meetHeaderViewModel = useMemo(
    () =>
      buildMeetHeaderViewModel({
        status: active.status,
        participantCount: active.peers.length + 1,
        showPeoplePanel: showMeetPeoplePanel,
        stageFit: meetStageFit,
        showSelfPreview: showMeetSelfPreview,
        selfPreviewExpanded: meetSelfPreviewExpanded,
      }),
    [
      active.peers.length,
      active.status,
      meetSelfPreviewExpanded,
      meetStageFit,
      showMeetPeoplePanel,
      showMeetSelfPreview,
    ]
  );

  async function handleJoin(): Promise<boolean> {
    if (sessionMode === 'meet') {
      stopPreJoinPreview();
    }

    const joined = await join();
    if (!joined && sessionMode === 'meet') {
      startPreJoinPreview();
    }
    return joined;
  }

  async function handleJoinFromPreJoin() {
    setGuestJoinError(null);
    setJoiningFromPreJoin(true);
    try {
      if (isGuestStudioFlow) {
        const trimmedDisplayName = displayName.trim();
        if (!requestedGuestToken) {
          setGuestClaimReady(false);
          setGuestJoinError('Guest invite token is missing. Ask host for a fresh invite link.');
          return;
        }
        if (!trimmedDisplayName) {
          setGuestClaimReady(false);
          setGuestJoinError('Name is required to join as a guest.');
          return;
        }

        const normalizedEmail = guestEmail.trim();
        const result = await ParticipantsAPI.bootstrapGuest({
          token: requestedGuestToken,
          displayName: trimmedDisplayName,
          ...(normalizedEmail ? { email: normalizedEmail } : {}),
        });
        setDisplayName(result.participant.displayName?.trim() || trimmedDisplayName);
        setClaimedGuestParticipantId(result.participant.id);
        setGuestClaimReady(true);
      }

      const ok = await handleJoin();
      if (ok) {
        stopPreJoinPreview();
        setShowPreJoin(false);
      } else if (isGuestStudioFlow) {
        setGuestJoinError('Unable to join the live room. Please retry or ask host to refresh the invite.');
      }
    } catch (err) {
      const guestJoinErr = err as Error & { code?: string; status?: number };
      const code = String(guestJoinErr.code ?? '');
      const status = Number(guestJoinErr.status ?? 0);
      if (code === 'invalid_token' || status === 401) {
        setGuestJoinError('Guest invite token is invalid or expired. Ask host for a fresh invite link.');
      } else if (code === 'invalid_display_name') {
        setGuestJoinError('Name is required to join as a guest.');
      } else {
        setGuestJoinError(guestJoinErr.message ?? 'Failed to join the studio as guest.');
      }
      if (isGuestStudioFlow) {
        setGuestClaimReady(false);
      }
    } finally {
      setJoiningFromPreJoin(false);
    }
  }

  function handleGuestWelcomeContinue() {
    setGuestJoinError(null);
    setGuestPreJoinStep('prejoin');
  }

  async function handleLeave() {
    if (sessionMode === 'studio' && canControlRecording && isRecording && !sessionBusy) {
      setSessionBusy(true);
      setSessionError(null);
      try {
        const response = await RecordingsAPI.stopSession(recordingId);
        setRecordingSession(response.session);
        setCanControlRecording(response.canControl);
        await new Promise((resolve) => window.setTimeout(resolve, 250));
        await finalizeTrackCaptures();
      } catch (err) {
        setSessionError((err as Error)?.message ?? 'Failed to stop recording session before leaving.');
      } finally {
        setSessionBusy(false);
      }
    }

    setPinnedTileKey(null);
    leaveAndReset();
    if (sessionMode === 'studio' && (requestedStudioRole === 'guest' || !!claimedGuestParticipantId)) {
      if (hasRegisteredTracks) {
        try {
          await finalizeTrackCaptures();
        } catch {
          // best-effort; redirect regardless
        }
      }
      router.replace(`/studio/${recordingId}/thanks`);
      return;
    }
    if (sessionMode === 'studio') {
      setShowPreJoin(true);
    }
  }

  async function handleToggleRecordingSession() {
    if (!canControlRecording || sessionBusy) return;

    setSessionBusy(true);
    setSessionError(null);
    try {
      const wasRecording = isRecording;
      if (!wasRecording) {
        const hostId = await ensureLocalHostParticipantId();
        if (!hostId) {
          throw new Error('Host participant is required before recording can start.');
        }
      }
      const response = isRecording
        ? await RecordingsAPI.stopSession(recordingId)
        : await RecordingsAPI.startSession(recordingId);

      setRecordingSession(response.session);
      setCanControlRecording(response.canControl);

      // P2: host broadcasts startedAt so all participants can include it in finalizeTrack
      if (!wasRecording && response.session.startedAt) {
        await broadcastSessionStart(response.session.startedAt);
      }

      if (wasRecording) {
        await new Promise((resolve) => window.setTimeout(resolve, 250));
        await finalizeTrackCaptures();
        // U1: enter stopped_uploading phase — room stays alive, uploads continue
        setStoppedUploadingPhase(true);
        if (dwellTimerRef.current) window.clearTimeout(dwellTimerRef.current);
        dwellTimerRef.current = window.setTimeout(() => {
          setStoppedUploadingPhase(false);
        }, 10 * 60 * 1000);
      }
    } catch (err) {
      setSessionError((err as Error)?.message ?? 'Failed to update recording session.');
    } finally {
      setSessionBusy(false);
    }
  }

  // U1: host removes a participant — broadcasts data message so guest navigates to thanks
  async function handleRemoveParticipant(participantId: string) {
    await broadcastRemoveParticipant(participantId);
  }

  function togglePin(tileKey: string) {
    setPinnedTileKey((prev) => (prev === tileKey ? null : tileKey));
  }

  useEffect(() => {
    if (sessionMode === 'studio' && !showPreJoin && active.status === 'idle') {
      setShowPreJoin(true);
    }
  }, [active.status, sessionMode, showPreJoin]);

  useEffect(() => {
    if (sessionMode === 'studio' && isRecording) {
      setShowStudioInvitePanel(false);
    }
  }, [isRecording, sessionMode]);

  const progressParticipants = useMemo(
    () => recordingProgress?.participants ?? [],
    [recordingProgress?.participants]
  );

  useEffect(() => {
    if (sessionMode !== 'studio') return;
    if (requestedStudioRole !== 'guest') return;
    if (!recordingSession?.stoppedAt) return;
    const hasLocalPendingUploads =
      chunkUploadQueue.stats.pending > 0 || chunkUploadQueue.stats.processing > 0;
    const hasBackendPendingUploads = progressParticipants.some((participant) => participant.state === 'uploading');
    const hasFailedUploads = chunkUploadQueue.stats.failed > 0;
    if (!hasLocalPendingUploads && !hasBackendPendingUploads && !hasFailedUploads) return;
    setShowUploadStatusModal(true);
  }, [
    chunkUploadQueue.stats.failed,
    chunkUploadQueue.stats.pending,
    chunkUploadQueue.stats.processing,
    progressParticipants,
    requestedStudioRole,
    recordingSession?.stoppedAt,
    sessionMode,
  ]);

  useEffect(() => {
    if (sessionMode === 'studio' && requestedStudioRole === 'guest') {
      setShowStudioInvitePanel(false);
      if (requestedGuestToken && !guestClaimReady) return;
      if (!effectiveRequestedParticipantId) {
        setSessionError('Guest invite link is missing participant context. Ask host for a fresh invite link.');
      }
    }
  }, [
    effectiveRequestedParticipantId,
    guestClaimReady,
    requestedGuestToken,
    requestedStudioRole,
    sessionMode,
  ]);

  const localStudioRole: 'host' | 'guest' = canControlRecording ? 'host' : 'guest';
  const localStudioRoleLabel = localStudioRole === 'host' ? 'Host' : 'Guest';
  const studioUiAccess = deriveStudioUiAccess(localStudioRole);
  const {
    localParticipantProgress,
    localQueueState,
    localUploadComplete,
    uploadCompletion,
    hasPendingUploads,
    canOpenProject,
    studioState,
    projectState,
    hostStudioLifecyclePhase,
    hostUploadOverlayOpen,
    uploadStatusState,
  } = useMemo(
    () =>
      deriveStudioUploadState({
        progressParticipants,
        recordingProgress,
        recordingSessionStoppedAt: recordingSession?.stoppedAt,
        isRecording,
        localStudioRole,
        showPreJoin,
        sessionBusy,
        recorderParticipantId,
        effectiveRequestedParticipantId,
        chunkUploadStats: chunkUploadQueue.stats,
      }),
    [
      chunkUploadQueue.stats,
      effectiveRequestedParticipantId,
      isRecording,
      localStudioRole,
      progressParticipants,
      recorderParticipantId,
      recordingProgress,
      recordingSession?.stoppedAt,
      sessionBusy,
      showPreJoin,
    ]
  );
  const uploadOverlayOpen =
    localStudioRole === 'host'
      ? hostUploadOverlayOpen
      : showUploadStatusModal;

  useEffect(() => {
    if (sessionMode !== 'studio') return;
    if (!showUploadStatusModal) return;
    if (!recordingSession?.stoppedAt) return;
    if (!localUploadComplete && chunkUploadQueue.stats.failed === 0) return;

    if (localStudioRole === 'guest') {
      router.replace(`/studio/${recordingId}/thanks`);
      return;
    }
  }, [
    localStudioRole,
    localUploadComplete,
    chunkUploadQueue.stats.failed,
    recordingId,
    recordingSession?.stoppedAt,
    router,
    sessionMode,
    showUploadStatusModal,
  ]);

  useEffect(() => {
    if (sessionMode !== 'studio') return;
    const hasWork =
      chunkUploadQueue.stats.pending + chunkUploadQueue.stats.processing > 0 ||
      hostStudioLifecyclePhase === 'stop_requested' ||
      hostStudioLifecyclePhase === 'uploading_after_stop';
    if (!hasWork) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [
    chunkUploadQueue.stats.pending,
    chunkUploadQueue.stats.processing,
    hostStudioLifecyclePhase,
    sessionMode,
  ]);

  if (showPreJoin && sessionMode === 'studio') {
    const isGuestWelcomeStep = isGuestStudioFlow && guestPreJoinStep === 'welcome';
    const guestNameMissing = isGuestStudioFlow && displayName.trim().length === 0;

    if (isGuestWelcomeStep) {
      return (
        <div className={spaceGrotesk.className}>
          <StudioGuestWelcome
            hasGuestToken={!!requestedGuestToken}
            onContinue={handleGuestWelcomeContinue}
          />
        </div>
      );
    }

    return (
      <div className={spaceGrotesk.className}>
        <StudioPreJoinSetup
          isGuestStudioFlow={isGuestStudioFlow}
          displayName={displayName}
          studioOwnerLabel={displayName || 'Host'}
          guestEmail={guestEmail}
          localStudioRole={localStudioRole}
          localStudioRoleLabel={localStudioRoleLabel}
          usingHeadphones={usingHeadphones}
          joiningFromPreJoin={joiningFromPreJoin}
          guestNameMissing={guestNameMissing}
          guestJoinError={guestJoinError}
          preJoinError={preJoinError}
          previewVideoRef={preJoinVideoRef}
          preJoinMicEnabled={preJoinMicEnabled}
          preJoinCamEnabled={preJoinCamEnabled}
          preJoinStatus={preJoinStatus}
          cameraDevices={cameraDevices}
          micDevices={micDevices}
          speakerDevices={speakerDevices}
          selectedCameraId={selectedCameraId}
          selectedMicId={selectedMicId}
          selectedSpeakerId={selectedSpeakerId}
          onDisplayNameChange={setDisplayName}
          onGuestEmailChange={setGuestEmail}
          onSetUsingHeadphones={setUsingHeadphones}
          onJoin={handleJoinFromPreJoin}
          onTogglePreJoinMic={togglePreJoinMic}
          onTogglePreJoinCam={togglePreJoinCam}
          onSelectedCameraIdChange={setSelectedCameraId}
          onSelectedMicIdChange={setSelectedMicId}
          onSelectedSpeakerIdChange={setSelectedSpeakerId}
          onRefreshPreview={startPreJoinPreview}
        />
      </div>
    );
  }

  if (!showPreJoin && sessionMode === 'studio') {
    const {
      screenTiles,
      webcamTiles,
      visibleTiles,
      isScreenShareDominant,
      stageGridClass,
      shouldFillTiles,
      tileClassName,
      peopleForPanel,
      showUploadChip,
      uploadChipLabel,
      recordingClock,
      isMicOff,
      isCamOff,
      shouldReserveUploadBarSpace,
      floatingUploadLayout,
      uploadSummary,
      uploadKeepPageOpenHint,
      uploadCanDismiss,
    } = buildStudioRouteViewModel({
      displayName,
      active,
      studioLayoutMode,
      progressParticipants,
      recorderParticipantId,
      effectiveRequestedParticipantId,
      isRecording,
      localStudioRole,
      localStudioRoleLabel,
      localQueueState,
      localUploadComplete,
      hasPendingUploads,
      canOpenProject,
      hostStudioLifecyclePhase,
      recordingSessionStartedAt: recordingSession?.startedAt,
      recordingSessionStoppedAt: recordingSession?.stoppedAt,
      showStudioPeoplePanel,
      uploadOverlayOpen,
      showUploadStatusModal,
      uploadCompletion,
      chunkUploadStats: chunkUploadQueue.stats,
    });

    return (
      <main className={`${spaceGrotesk.className} studio-shell-background h-screen overflow-hidden text-slate-100`}>
        <div className="mx-auto flex h-full w-full max-w-[1600px] flex-col px-5 py-4">
          <StudioHeaderBar
            displayName={displayName}
            recordingTitle="Untitled Recording"
            isRecording={isRecording}
            recordingClock={recordingClock}
            showUploadChip={showUploadChip}
            uploadChipLabel={uploadChipLabel}
            canUseBroadcastControls={studioUiAccess.canUseBroadcastControls}
            canSendInvites={studioUiAccess.canSendInvites}
            onOpenInviteModal={() => {
              setIsInviteModalOpen(true);
              setShowAddParticipantPanel(false);
              setInviteNotice(null);
              setCopyState('idle');
            }}
          />

          <StudioStatusBanners
            streamWarning={streamWarning}
            stoppedUploadingPhase={stoppedUploadingPhase}
            localStudioRole={localStudioRole}
            fallbackNotice={fallbackNotice}
            sessionError={sessionError}
            recorderError={recorderError}
            chunkUploadError={chunkUploadQueue.lastError}
            activeError={active.error}
          />

          <div className="mt-3 flex min-h-0 flex-1 gap-4">
            <section className="flex min-h-0 flex-1 flex-col rounded-3xl border border-[color:var(--workspace-border)] bg-[rgba(12,14,18,0.72)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
              <div className={`flex min-h-0 flex-1 gap-3 ${shouldReserveUploadBarSpace ? 'mb-20' : ''}`}>
                {studioUiAccess.canSendInvites && showStudioInvitePanel && (
                  <StudioInviteSidePanel
                    inviteLink={inviteLink}
                    inviteRole={inviteRole}
                    copyState={copyState}
                    onInviteRoleChange={setInviteRole}
                    onCopyLink={handleCopyInviteLink}
                    onClose={() => setShowStudioInvitePanel(false)}
                  />
                )}

                <StudioStageArea
                  isScreenShareDominant={isScreenShareDominant}
                  screenTiles={screenTiles}
                  webcamTiles={webcamTiles}
                  visibleTiles={visibleTiles}
                  stageGridClass={stageGridClass}
                  centerConstrained={studioUiAccess.canSendInvites && showStudioInvitePanel}
                  tileClassName={tileClassName}
                  pinnedTileKey={pinnedTileKey}
                  shouldFillTiles={shouldFillTiles}
                  localMicEnabled={active.isMicEnabled}
                  onToggleLocalMic={active.toggleMic}
                  onTogglePin={togglePin}
                />
              </div>

              <StudioControlBar
                showRecordButton={localStudioRole === 'host'}
                canControlRecording={canControlRecording}
                sessionBusy={sessionBusy}
                isRecording={isRecording}
                isMicOff={isMicOff}
                isCamOff={isCamOff}
                isScreenSharing={active.isScreenSharing}
                onToggleRecordingSession={handleToggleRecordingSession}
                onToggleMic={active.toggleMic}
                onToggleCamera={active.toggleCamera}
                onToggleScreen={active.toggleScreen}
                onLeave={handleLeave}
              />

              <StudioRetryUploadsButton
                failedCount={chunkUploadQueue.stats.failed}
                onRetry={() => chunkUploadQueue.retryFailed()}
              />
            </section>

            <StudioPeopleSidebar
              showPanel={showStudioPeoplePanel}
              showAddParticipantPanel={showAddParticipantPanel}
              canManageParticipants={studioUiAccess.canManageParticipants}
              isRecording={isRecording}
              stoppedUploadingPhase={stoppedUploadingPhase}
              people={peopleForPanel}
              onClosePanel={() => {
                setShowStudioPeoplePanel(false);
                setShowAddParticipantPanel(false);
              }}
              onTogglePanel={() =>
                setShowStudioPeoplePanel((prev) => {
                  const next = !prev;
                  if (!next) {
                    setShowAddParticipantPanel(false);
                  }
                  return next;
                })
              }
              onToggleAddParticipantPanel={() => setShowAddParticipantPanel((prev) => !prev)}
              onOpenInviteModal={() => {
                setIsInviteModalOpen(true);
                setInviteNotice(null);
                setCopyState('idle');
                setShowAddParticipantPanel(false);
              }}
              onShowInPersonGuestPanel={() => {
                setShowStudioInvitePanel(true);
                setShowAddParticipantPanel(false);
              }}
              onRemoveParticipant={(participantId) => {
                void handleRemoveParticipant(participantId);
              }}
            />
          </div>
        </div>

        <UploadStatusModal
          open={uploadOverlayOpen}
          participants={progressParticipants}
          canOpenProject={canOpenProject}
          state={uploadStatusState}
          variant={localStudioRole === 'host' ? 'floating' : 'modal'}
          floatingLayout={localStudioRole === 'host' ? floatingUploadLayout : undefined}
          summary={uploadSummary}
          keepPageOpenHint={uploadKeepPageOpenHint}
          canDismiss={uploadCanDismiss}
          onClose={() => {
            if (localStudioRole !== 'host') {
              setShowUploadStatusModal(false);
            }
          }}
          onGoToProject={() => {
            if (!canOpenProject) return;
            setShowUploadStatusModal(false);
            if (localStudioRole === 'host') {
              router.push(`/recordings/${recordingId}`);
            }
          }}
        />

        <StudioInviteModal
          open={studioUiAccess.canSendInvites && isInviteModalOpen}
          inviteLink={inviteLink}
          inviteRole={inviteRole}
          inviteEmail={inviteEmail}
          inviteNotice={inviteNotice}
          copyState={copyState}
          onInviteRoleChange={setInviteRole}
          onInviteEmailChange={setInviteEmail}
          onCopyLink={handleCopyInviteLink}
          onSendInvite={handleInviteByEmail}
          onClose={() => {
            setIsInviteModalOpen(false);
            setInviteNotice(null);
            setCopyState('idle');
          }}
        />
      </main>
    );
  }

  return (
    <main className={`${spaceGrotesk.className} h-[100dvh] overflow-hidden bg-[#0b0d11] text-slate-100`}>
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#171a22_0%,#0c0f14_45%,#07090d_100%)]" />
      </div>

      <div className="mx-auto flex h-full w-full max-w-[1700px] flex-col px-4 py-4">
        <MeetHeaderBar
          recordingId={recordingId}
          statusLabel={meetHeaderViewModel.statusLabel}
          participantCount={meetHeaderViewModel.participantCount}
          showViewMenu={showMeetViewMenu}
          fitLabel={meetHeaderViewModel.fitLabel}
          showPeopleLabel={meetHeaderViewModel.showPeopleLabel}
          hasRemoteStage={hasRemoteStage}
          selfPreviewLabel={meetHeaderViewModel.selfPreviewLabel}
          showSelfPreviewSizeAction={meetHeaderViewModel.showSelfPreviewSizeAction}
          selfPreviewSizeLabel={meetHeaderViewModel.selfPreviewSizeLabel}
          onToggleViewMenu={() => setShowMeetViewMenu((prev) => !prev)}
          onToggleFit={() => {
            setMeetStageFit((prev) => (prev === 'contain' ? 'cover' : 'contain'));
            setShowMeetViewMenu(false);
          }}
          onToggleFullscreen={async () => {
            await toggleMeetFullscreen();
            setShowMeetViewMenu(false);
          }}
          onTogglePeoplePanel={() => {
            setShowMeetPeoplePanel((prev) => !prev);
            setShowMeetViewMenu(false);
          }}
          onToggleSelfPreview={() => {
            setShowMeetSelfPreview((prev) => !prev);
            setShowMeetViewMenu(false);
          }}
          onToggleSelfPreviewSize={() => {
            setMeetSelfPreviewExpanded((prev) => !prev);
            setShowMeetViewMenu(false);
          }}
        />

        <MeetStatusBanners fallbackNotice={fallbackNotice} activeError={active.error} />

        <section
          ref={meetStageRef}
          className={`relative mt-4 grid min-h-0 flex-1 gap-3 overflow-hidden rounded-[28px] border border-slate-800/80 bg-[#090b0f] p-3 ${
            showMeetPeoplePanel ? 'lg:grid-cols-[minmax(0,1fr)_320px]' : 'lg:grid-cols-1'
          }`}
        >
          <MeetStageArea
            meetMainTile={meetMainTile}
            meetStageFit={meetStageFit}
            pinnedTileKey={pinnedTileKey}
            meetVisibleSecondaryTiles={meetVisibleSecondaryTiles}
            meetLocalTileKey={meetLocalTile.key}
            meetSelfPreviewExpanded={meetSelfPreviewExpanded}
            onOpenMainContextMenu={(event) => openMeetContextMenu(event, meetMainTile.key, true)}
            onOpenSecondaryContextMenu={(event, tileKey) => openMeetContextMenu(event, tileKey, false)}
          />

          <MeetPeoplePanel
            open={showMeetPeoplePanel}
            people={meetPeople}
            onClose={() => setShowMeetPeoplePanel(false)}
            onPin={togglePin}
          />
        </section>

        <MeetControlBar
          isConnected={isConnected}
          isJoining={active.status === 'connecting'}
          micEnabled={active.isMicEnabled}
          cameraEnabled={active.isCameraEnabled}
          screenSharing={active.isScreenSharing}
          onToggleMic={active.toggleMic}
          onToggleCamera={active.toggleCamera}
          onToggleScreen={active.toggleScreen}
          onJoinLeave={isConnected ? handleLeave : handleJoin}
        />
      </div>

      <MeetContextMenu
        menu={meetContextMenu}
        pinnedTileKey={pinnedTileKey}
        meetLocalTileKey={meetLocalTile.key}
        hasRemoteStage={hasRemoteStage}
        meetSelfPreviewExpanded={meetSelfPreviewExpanded}
        onPin={(tileKey) => setPinnedTileKey(tileKey)}
        onUnpin={() => setPinnedTileKey(null)}
        onHideSelfPreview={() => setShowMeetSelfPreview(false)}
        onToggleSelfPreviewSize={() => setMeetSelfPreviewExpanded((prev) => !prev)}
        onToggleFullscreen={toggleMeetFullscreen}
        onClose={closeMeetContextMenu}
      />
    </main>
  );
}
