import { buildProjectWorkspaceViewModel, stateSummaryCopy } from '@/lib/projects/useProjectWorkspace';

describe('useProjectWorkspace helpers', () => {
  it('builds a ready project workspace model', () => {
    const model = buildProjectWorkspaceViewModel({
      recording: {
        id: 'rec_ready',
        title: 'Host interview',
        createdAt: '2026-03-30T10:00:00.000Z',
      },
      progress: {
        recordingId: 'rec_ready',
        studioState: 'upload complete',
        projectState: 'ready',
        session: { controlVersion: 1 },
        studio: { canOpenProject: true, keepPageOpen: false },
        summary: {
          participantsTotal: 2,
          participantsComplete: 2,
          participantsUploading: 0,
          actionRequiredParticipants: 0,
        },
        participants: [],
      },
      projectAssets: {
        project: {
          recordingId: 'rec_ready',
          title: 'Host interview',
          state: 'ready',
          label: 'Host interview',
          minimumReady: true,
          fullyProcessed: true,
        },
        combinedAsset: {
          id: 'combined',
          kind: 'combined',
          type: 'combined_playback',
          label: 'All participants',
          state: 'ready',
          badges: [],
          previewUrl: 'https://example.com/combined.mp4',
          playbackUrl: 'https://example.com/combined.mp4',
          availableDerivatives: [],
          minimumReady: true,
          fullyProcessed: true,
          pendingWork: [],
          failedWork: [],
          actions: [
            {
              id: 'download-combined',
              label: 'Download',
              kind: 'api',
              href: '/v1/exports/exp_1',
              method: 'GET',
            },
          ],
        },
        participantAssets: [],
        processingSummary: {
          minimumReady: true,
          fullyProcessed: true,
          readyPrimaryAsset: true,
          readyParticipantCount: 0,
          participantCount: 0,
          pendingWork: [],
          failedWork: [],
        },
        transcript: {
          id: 'transcript',
          type: 'transcript_artifact',
          label: 'Transcript',
          state: 'ready',
          badges: [],
          minimumReady: true,
          fullyProcessed: true,
          pendingWork: [],
          failedWork: [],
          actions: [],
        },
        captions: {
          id: 'captions',
          type: 'caption_derivative',
          label: 'Captions',
          state: 'processing',
          badges: [],
          minimumReady: false,
          fullyProcessed: false,
          pendingWork: [],
          failedWork: [],
          actions: [],
        },
        exports: {
          requiredTotal: 1,
          ready: 1,
          processing: 0,
          actionRequired: 0,
          items: [
            {
              id: 'exp_mp4',
              type: 'mp4',
              label: 'MP4 export',
              state: 'ready',
              badges: [],
              minimumReady: true,
              fullyProcessed: true,
              pendingWork: [],
              failedWork: [],
              actions: [],
            },
          ],
        },
      },
    });

    expect(model.id).toBe('rec_ready');
    expect(model.projectState).toBe('ready');
    expect(model.hero?.previewUrl).toBe('https://example.com/combined.mp4');
    expect(model.artifacts).toHaveLength(3);
  });

  it('compresses processing state copy for unfinished projects', () => {
    expect(stateSummaryCopy('processing')).toBe(
      'Processing is still running on your recording.'
    );
    expect(stateSummaryCopy('action required')).toBe(
      'This recording needs attention before it is fully ready.'
    );
  });
});
