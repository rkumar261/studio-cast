'use client';

import { useCallback, useEffect, useState } from 'react';
import { RecordingsAPI, type RecordingProgressResponse, type RecordingSessionResponse } from '@/lib/recordings.api';

type SessionMode = 'meet' | 'studio';
type StudioRole = 'guest' | 'host' | null;

type UseStudioSessionStateArgs = {
  sessionMode: SessionMode;
  requestedStudioRole: StudioRole;
  recordingId: string;
  guestClaimReady: boolean;
  hasLocalQueueWork: boolean;
  stoppedUploadingPhase: boolean;
  showUploadStatusModal: boolean;
};

export function useStudioSessionState(args: UseStudioSessionStateArgs) {
  const {
    sessionMode,
    requestedStudioRole,
    recordingId,
    guestClaimReady,
    hasLocalQueueWork,
    stoppedUploadingPhase,
    showUploadStatusModal,
  } = args;
  const [recordingSession, setRecordingSession] = useState<RecordingSessionResponse['session'] | null>(null);
  const [recordingProgress, setRecordingProgress] = useState<RecordingProgressResponse | null>(null);
  const [canControlRecording, setCanControlRecording] = useState(false);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const isRecording = !!recordingSession?.startedAt && !recordingSession?.stoppedAt;

  const refreshRecordingSession = useCallback(async () => {
    if (sessionMode !== 'studio') return;
    if (requestedStudioRole === 'guest' && !guestClaimReady) return;

    try {
      const res = await RecordingsAPI.getSession(recordingId);
      setRecordingSession(res.session);
      setCanControlRecording(requestedStudioRole === 'guest' ? false : res.canControl);
      setSessionError(null);
    } catch (err) {
      setSessionError((err as Error)?.message ?? 'Failed to refresh recording session.');
    }
  }, [guestClaimReady, recordingId, requestedStudioRole, sessionMode]);

  const refreshRecordingProgress = useCallback(async () => {
    if (sessionMode !== 'studio') return;
    if (requestedStudioRole === 'guest' && !guestClaimReady) return;
    try {
      const progress = await RecordingsAPI.getProgress(recordingId);
      setRecordingProgress(progress);
    } catch {
      // Keep studio controls usable even when progress polling fails.
    }
  }, [guestClaimReady, recordingId, requestedStudioRole, sessionMode]);

  const hasBackendPendingFromProgress = (recordingProgress?.participants ?? []).some(
    (participant) => participant.state === 'uploading' || participant.state === 'action required'
  );
  const shouldPollDuringHostHandoff =
    sessionMode === 'studio' && canControlRecording && !!recordingSession?.stoppedAt;
  const shouldPollStudioSession =
    sessionMode === 'studio' &&
    (!recordingSession?.stoppedAt ||
      isRecording ||
      hasLocalQueueWork ||
      showUploadStatusModal ||
      shouldPollDuringHostHandoff);
  const shouldPollStudioProgress =
    sessionMode === 'studio' &&
    (!recordingSession?.stoppedAt ||
      isRecording ||
      stoppedUploadingPhase ||
      hasLocalQueueWork ||
      hasBackendPendingFromProgress ||
      showUploadStatusModal ||
      shouldPollDuringHostHandoff);

  useEffect(() => {
    if (sessionMode !== 'studio') return;
    void refreshRecordingSession();
    if (!shouldPollStudioSession) return;

    const timer = window.setInterval(() => {
      void refreshRecordingSession();
    }, 5000);

    return () => window.clearInterval(timer);
  }, [refreshRecordingSession, sessionMode, shouldPollStudioSession]);

  useEffect(() => {
    if (sessionMode !== 'studio') return;
    void refreshRecordingProgress();
    if (!shouldPollStudioProgress) return;

    const progressPollMs = recordingProgress?.projectState === 'processing' ? 1000 : 3000;
    const timer = window.setInterval(() => {
      void refreshRecordingProgress();
    }, progressPollMs);
    return () => window.clearInterval(timer);
  }, [recordingProgress?.projectState, refreshRecordingProgress, sessionMode, shouldPollStudioProgress]);

  return {
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
    refreshRecordingSession,
    refreshRecordingProgress,
  };
}
