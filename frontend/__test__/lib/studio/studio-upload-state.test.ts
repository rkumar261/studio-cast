import { deriveStudioUploadState } from '@/lib/studio/studio-upload-state';

describe('deriveStudioUploadState', () => {
  it('keeps a guest in uploading state while local queue work remains', () => {
    const state = deriveStudioUploadState({
      progressParticipants: [],
      recordingProgress: null,
      recordingSessionStoppedAt: '2026-04-15T10:00:00.000Z',
      isRecording: false,
      localStudioRole: 'guest',
      showPreJoin: false,
      sessionBusy: false,
      recorderParticipantId: 'guest-1',
      effectiveRequestedParticipantId: 'guest-1',
      chunkUploadStats: {
        pending: 2,
        processing: 1,
        failed: 0,
      },
    });

    expect(state.localQueueState).toBe('uploading');
    expect(state.hasPendingUploads).toBe(true);
    expect(state.canOpenProject).toBe(false);
    expect(state.uploadStatusState).toBe('uploading');
  });

  it('keeps host upload state on studio_upload_complete before switching overlay to project status', () => {
    const state = deriveStudioUploadState({
      progressParticipants: [
        {
          participantId: 'host-1',
          role: 'host',
          displayName: 'Host',
          state: 'upload complete',
          progressPct: 100,
        },
      ],
      recordingProgress: {
        recordingId: 'rec-1',
        studioState: 'upload complete',
        projectState: 'processing',
        session: {
          startedAt: '2026-04-15T09:00:00.000Z',
          stoppedAt: '2026-04-15T09:30:00.000Z',
          hostParticipantId: 'host-1',
          controlVersion: 1,
        },
        studio: {
          canOpenProject: true,
          keepPageOpen: false,
        },
        summary: {
          participantsTotal: 1,
          participantsComplete: 1,
          participantsUploading: 0,
          actionRequiredParticipants: 0,
        },
        participants: [
          {
            participantId: 'host-1',
            role: 'host',
            displayName: 'Host',
            state: 'upload complete',
            progressPct: 100,
          },
        ],
      },
      recordingSessionStoppedAt: '2026-04-15T09:30:00.000Z',
      isRecording: false,
      localStudioRole: 'host',
      showPreJoin: false,
      sessionBusy: false,
      recorderParticipantId: 'host-1',
      effectiveRequestedParticipantId: null,
      chunkUploadStats: {
        pending: 0,
        processing: 0,
        failed: 0,
      },
    });

    expect(state.canOpenProject).toBe(true);
    expect(state.projectState).toBe('processing');
    expect(state.hostStudioLifecyclePhase).toBe('studio_upload_complete');
    expect(state.hostUploadOverlayOpen).toBe(true);
    expect(state.uploadStatusState).toBe('upload complete');
  });
});
