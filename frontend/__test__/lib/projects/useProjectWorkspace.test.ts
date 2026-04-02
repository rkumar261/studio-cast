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
    expect(model.artifacts).toHaveLength(2);
    expect(model.artifacts.map((artifact) => artifact.title)).toEqual([
      'Captions',
      'MP4 export',
    ]);
  });

  it('compresses processing state copy for unfinished projects', () => {
    expect(stateSummaryCopy('processing')).toBe(
      'Processing is still running on your recording.'
    );
    expect(stateSummaryCopy('action required')).toBe(
      'This recording needs attention before it is fully ready.'
    );
  });

  it('uses participant names when the recording title is blank', () => {
    const model = buildProjectWorkspaceViewModel({
      recording: {
        id: 'rec_names',
        title: '   ',
        createdAt: '2026-04-01T08:00:00.000Z',
      },
      progress: null,
      projectAssets: {
        project: {
          recordingId: 'rec_names',
          title: undefined,
          state: 'processing',
          label: 'Processing',
          minimumReady: false,
          fullyProcessed: false,
        },
        combinedAsset: {
          id: 'combined_names',
          kind: 'combined',
          type: 'combined_playback',
          label: 'All participants',
          state: 'processing',
          badges: [],
          availableDerivatives: [],
          minimumReady: false,
          fullyProcessed: false,
          pendingWork: [],
          failedWork: [],
          actions: [],
        },
        participantAssets: [
          {
            id: 'participant_host',
            kind: 'participant',
            type: 'participant_playback',
            label: 'Host',
            state: 'processing',
            badges: [],
            availableDerivatives: [],
            minimumReady: false,
            fullyProcessed: false,
            pendingWork: [],
            failedWork: [],
            participant: {
              id: 'participant_host',
              role: 'host',
              name: 'Rakesh',
            },
            actions: [],
          },
          {
            id: 'participant_guest',
            kind: 'participant',
            type: 'participant_playback',
            label: 'Guest',
            state: 'processing',
            badges: [],
            availableDerivatives: [],
            minimumReady: false,
            fullyProcessed: false,
            pendingWork: [],
            failedWork: [],
            participant: {
              id: 'participant_guest',
              role: 'guest',
              name: 'Raw Man',
            },
            actions: [],
          },
        ],
        processingSummary: {
          minimumReady: false,
          fullyProcessed: false,
          readyPrimaryAsset: false,
          readyParticipantCount: 0,
          participantCount: 2,
          pendingWork: [],
          failedWork: [],
        },
        transcript: {
          id: 'transcript_pending',
          type: 'transcript_artifact',
          label: 'Transcript',
          state: 'processing',
          badges: [],
          minimumReady: false,
          fullyProcessed: false,
          pendingWork: [],
          failedWork: [],
          actions: [],
        },
        captions: {
          id: 'captions_pending',
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
          requiredTotal: 0,
          ready: 0,
          processing: 0,
          actionRequired: 0,
          items: [],
        },
      },
    });

    expect(model.title).toBe('Rakesh & Raw Man');
  });

  it('dedupes captioned video exports and keeps transcript out of the flat artifact list', () => {
    const model = buildProjectWorkspaceViewModel({
      recording: {
        id: 'rec_dedupe',
        title: '  ',
        createdAt: '2026-04-01T09:00:00.000Z',
      },
      progress: null,
      projectAssets: {
        project: {
          recordingId: 'rec_dedupe',
          title: undefined,
          state: 'processing',
          label: 'Processing',
          minimumReady: false,
          fullyProcessed: false,
        },
        combinedAsset: {
          id: 'combined_dedupe',
          kind: 'combined',
          type: 'combined_playback',
          label: 'All participants',
          state: 'processing',
          badges: [],
          availableDerivatives: [],
          minimumReady: false,
          fullyProcessed: false,
          pendingWork: [],
          failedWork: [],
          actions: [],
        },
        participantAssets: [],
        processingSummary: {
          minimumReady: false,
          fullyProcessed: false,
          readyPrimaryAsset: false,
          readyParticipantCount: 0,
          participantCount: 0,
          pendingWork: [],
          failedWork: [],
        },
        transcript: {
          id: 'transcript_dedupe',
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
          id: 'captions_dedupe',
          type: 'caption_derivative',
          label: 'Captioned video (All participants)',
          state: 'processing',
          badges: [],
          minimumReady: false,
          fullyProcessed: false,
          pendingWork: [],
          failedWork: [],
          actions: [],
        },
        exports: {
          requiredTotal: 3,
          ready: 1,
          processing: 2,
          actionRequired: 0,
          items: [
            {
              id: 'exp_captioned_video',
              type: 'mp4_captions',
              label: 'Captioned video (All participants)',
              state: 'processing',
              badges: [],
              minimumReady: false,
              fullyProcessed: false,
              pendingWork: [],
              failedWork: [],
              actions: [],
            },
            {
              id: 'exp_mp4',
              type: 'mp4',
              label: 'Video export (MP4)',
              state: 'ready',
              badges: [],
              minimumReady: true,
              fullyProcessed: true,
              pendingWork: [],
              failedWork: [],
              actions: [],
            },
            {
              id: 'exp_wav',
              type: 'wav',
              label: 'Audio export (WAV)',
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

    expect(model.artifacts.map((artifact) => artifact.title)).toEqual([
      'Captioned video (All participants)',
      'Video export (MP4)',
      'Audio export (WAV)',
    ]);
    expect(model.artifacts.every((artifact) => artifact.title !== 'Transcript')).toBe(true);
  });
});
