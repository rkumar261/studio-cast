import {
  buildMeetHeaderViewModel,
  buildStudioRouteViewModel,
} from '@/lib/studio/studio-page-view-model';
import type { MediaSource } from '@/lib/studio/media';

function media(stream: MediaStream | null): MediaSource {
  return { kind: 'media', stream };
}

describe('studio page view model helpers', () => {
  it('builds meet header labels from connection and UI state', () => {
    expect(
      buildMeetHeaderViewModel({
        status: 'connected',
        participantCount: 3,
        showPeoplePanel: true,
        stageFit: 'contain',
        showSelfPreview: true,
        selfPreviewExpanded: false,
      })
    ).toEqual({
      statusLabel: 'Live',
      participantCount: 3,
      fitLabel: 'Fill screen',
      showPeopleLabel: 'Hide people',
      selfPreviewLabel: 'Hide self',
      showSelfPreviewSizeAction: true,
      selfPreviewSizeLabel: 'Maximize self',
    });
  });

  it('builds the host studio upload and people view model from live progress', () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(
      new Date('2026-04-27T10:02:05.000Z').getTime()
    );

    const result = buildStudioRouteViewModel({
      displayName: 'Rakesh',
      active: {
        status: 'connected',
        isMicEnabled: false,
        isCameraEnabled: true,
        localVideo: media(null),
        localScreen: media(null),
        tiles: [],
        peers: [{ id: 'guest-1', label: 'Raniki' }],
      },
      studioLayoutMode: 'grid',
      progressParticipants: [
        {
          participantId: 'host-1',
          role: 'host',
          displayName: 'Rakesh',
          state: 'recording',
          progressPct: 35,
        },
        {
          participantId: 'guest-1',
          role: 'guest',
          displayName: 'Raniki',
          state: 'recording',
          progressPct: 0,
        },
      ],
      recorderParticipantId: 'host-1',
      effectiveRequestedParticipantId: null,
      isRecording: true,
      localStudioRole: 'host',
      localStudioRoleLabel: 'Host',
      localQueueState: 'uploading',
      localUploadComplete: false,
      hasPendingUploads: true,
      canOpenProject: false,
      hostStudioLifecyclePhase: 'recording_active',
      recordingSessionStartedAt: '2026-04-27T10:00:00.000Z',
      recordingSessionStoppedAt: undefined,
      showStudioPeoplePanel: true,
      uploadOverlayOpen: true,
      showUploadStatusModal: false,
      uploadCompletion: {
        participantsTotal: 2,
        participantsComplete: 0,
        participantsUploading: 2,
        actionRequiredParticipants: 0,
        keepPageOpen: true,
      },
      chunkUploadStats: {
        pending: 1,
        processing: 1,
        failed: 0,
        bytesProcessing: 20,
        bytesUploaded: 20,
        bytesTotal: 100,
      },
    });

    expect(result.recordingClock).toBe('02:05');
    expect(result.showUploadChip).toBe(true);
    expect(result.uploadChipLabel).toBe('↑ 40% Uploading...');
    expect(result.isMicOff).toBe(true);
    expect(result.isCamOff).toBe(false);
    expect(result.shouldReserveUploadBarSpace).toBe(true);
    expect(result.floatingUploadLayout).toEqual({
      leftInset: 54,
      rightInset: 510,
      bottomInset: 150,
    });
    expect(result.peopleForPanel).toEqual([
      {
        id: 'local-live',
        label: 'Rakesh',
        role: 'Host',
        percent: 40,
        note: '40% uploaded (recording)',
        showProgressBar: true,
      },
      {
        id: 'guest-1',
        label: 'Raniki',
        role: 'Guest',
        percent: 0,
        note: 'Recording...',
        showProgressBar: false,
      },
    ]);
    expect(result.uploadSummary).toEqual({
      participantsTotal: 2,
      participantsComplete: 0,
      participantsUploading: 2,
      actionRequiredParticipants: 0,
    });

    nowSpy.mockRestore();
  });
});
