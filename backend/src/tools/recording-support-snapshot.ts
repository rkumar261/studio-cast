/*
 * Owner/operator support snapshot for a recording.
 *
 * Usage:
 *   API_BASE=http://localhost:8080 \
 *   AUTH_COOKIE='access_token=...' \
 *   RECORDING_ID='<recording-id>' \
 *   npm run support:recording
 *
 * Optional:
 *   SUPPORT_JSON=1 npm run support:recording
 */

type ConsumerRecordingState =
  | 'recording'
  | 'uploading'
  | 'upload complete'
  | 'processing'
  | 'ready'
  | 'action required';

type ProgressResponse = {
  recordingId: string;
  studioState: ConsumerRecordingState;
  projectState: ConsumerRecordingState;
  summary: {
    participantsTotal: number;
    participantsComplete: number;
    participantsUploading: number;
    actionRequiredParticipants: number;
  };
};

type ProjectAssetsResponse = {
  project: {
    recordingId: string;
    state: ConsumerRecordingState;
    label: string;
    minimumReady: boolean;
    fullyProcessed: boolean;
  };
  processingSummary: {
    minimumReady: boolean;
    fullyProcessed: boolean;
    readyPrimaryAsset: boolean;
    readyParticipantCount: number;
    participantCount: number;
    pendingWork: Array<{ label: string; state: string; reason?: string; participantId?: string }>;
    failedWork: Array<{ label: string; state: string; reason?: string; participantId?: string }>;
  };
  combinedAsset: {
    state: ConsumerRecordingState;
    blockedReason?: string;
    playbackUrl?: string;
    downloadUrl?: string;
  };
  participantAssets: Array<{
    participantId?: string;
    label: string;
    state: ConsumerRecordingState;
    blockedReason?: string;
  }>;
};

type LifecycleDiagnosticsResponse = {
  recording: {
    id: string;
    status: string;
    lifecycleState: string;
    canonicalLifecycleState: string;
    startedAt?: string;
    stoppedAt?: string;
    uploadCompletedAt?: string;
    processingStartedAt?: string;
    readyAt?: string;
    failedAt?: string;
    failureReason?: string;
  };
  tracks: Array<{
    id: string;
    participantId: string;
    kind: string;
    state: string;
    lifecycleState: string;
    canonicalLifecycleState: string;
    finalSeq?: number;
    highestExistingSeq: number;
    highestContiguousUploadedSeq: number;
    missingSeqs: number[];
    blockedReason?: string;
    failureReason?: string;
  }>;
};

function durationMs(from?: string, to?: string) {
  if (!from || !to) return undefined;
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return undefined;
  return end - start;
}

function formatDuration(ms?: number) {
  if (typeof ms !== 'number') return undefined;
  if (ms < 1000) return `${ms}ms`;
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
}

const API_BASE = process.env.API_BASE ?? 'http://localhost:8080';
const AUTH_COOKIE = process.env.AUTH_COOKIE ?? '';
const RECORDING_ID = process.env.RECORDING_ID ?? process.argv[2] ?? '';
const JSON_MODE = process.env.SUPPORT_JSON === '1' || process.argv.includes('--json');

if (process.argv.includes('--help')) {
  console.log(
    [
      'Usage:',
      "  API_BASE=http://localhost:8080 AUTH_COOKIE='access_token=...' RECORDING_ID='<recording-id>' npm run support:recording",
      '',
      'Options:',
      '  --json         output raw JSON summary',
      '  --help         show this message',
    ].join('\n')
  );
  process.exit(0);
}

if (!RECORDING_ID) {
  console.error('Missing RECORDING_ID. Set RECORDING_ID env or pass as the first argument.');
  process.exit(2);
}

function authHeaders() {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (AUTH_COOKIE) headers.cookie = AUTH_COOKIE;
  return headers;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: authHeaders(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} for ${path}: ${text}`);
  }

  return (await res.json()) as T;
}

async function main() {
  const [progress, projectAssets, diagnostics] = await Promise.all([
    getJson<ProgressResponse>(`/v1/recordings/${RECORDING_ID}/progress`),
    getJson<ProjectAssetsResponse>(`/v1/recordings/${RECORDING_ID}/project-assets`),
    getJson<LifecycleDiagnosticsResponse>(`/v1/recordings/${RECORDING_ID}/lifecycle-diagnostics`),
  ]);

  const blockedTracks = diagnostics.tracks.filter((track) => track.blockedReason || track.failureReason);
  const stopToUploadCompleteMs = durationMs(
    diagnostics.recording.stoppedAt,
    diagnostics.recording.uploadCompletedAt
  );
  const stopToProcessingMs = durationMs(
    diagnostics.recording.stoppedAt,
    diagnostics.recording.processingStartedAt
  );
  const stopToReadyMs = durationMs(
    diagnostics.recording.stoppedAt,
    diagnostics.recording.readyAt
  );

  const snapshot = {
    recordingId: RECORDING_ID,
    progress: {
      studioState: progress.studioState,
      projectState: progress.projectState,
      participantSummary: progress.summary,
    },
    project: {
      label: projectAssets.project.label,
      state: projectAssets.project.state,
      minimumReady: projectAssets.project.minimumReady,
      fullyProcessed: projectAssets.project.fullyProcessed,
      readyPrimaryAsset: projectAssets.processingSummary.readyPrimaryAsset,
      readyParticipantCount: projectAssets.processingSummary.readyParticipantCount,
      participantCount: projectAssets.processingSummary.participantCount,
      pendingWork: projectAssets.processingSummary.pendingWork,
      failedWork: projectAssets.processingSummary.failedWork,
      combinedAsset: projectAssets.combinedAsset,
      participantAssets: projectAssets.participantAssets,
    },
    diagnostics: {
      recordingStatus: diagnostics.recording.status,
      recordingLifecycleState: diagnostics.recording.lifecycleState,
      canonicalLifecycleState: diagnostics.recording.canonicalLifecycleState,
      timeline: {
        startedAt: diagnostics.recording.startedAt,
        stoppedAt: diagnostics.recording.stoppedAt,
        uploadCompletedAt: diagnostics.recording.uploadCompletedAt,
        processingStartedAt: diagnostics.recording.processingStartedAt,
        readyAt: diagnostics.recording.readyAt,
        failedAt: diagnostics.recording.failedAt,
      },
      sla: {
        stopToUploadCompleteMs,
        stopToProcessingMs,
        stopToReadyMs,
        minimumReadyReached: projectAssets.project.minimumReady,
        fullyReadyReached: projectAssets.project.fullyProcessed,
      },
      recordingFailureReason: diagnostics.recording.failureReason,
      blockedTracks,
    },
  };

  if (JSON_MODE) {
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }

  console.log('[support] recording', snapshot.recordingId);
  console.log('[support] progress', snapshot.progress);
  console.log('[support] project', {
    label: snapshot.project.label,
    state: snapshot.project.state,
    minimumReady: snapshot.project.minimumReady,
    fullyProcessed: snapshot.project.fullyProcessed,
    readyPrimaryAsset: snapshot.project.readyPrimaryAsset,
    readyParticipantCount: snapshot.project.readyParticipantCount,
    participantCount: snapshot.project.participantCount,
  });
  console.log('[support] pendingWork', snapshot.project.pendingWork);
  console.log('[support] failedWork', snapshot.project.failedWork);
  console.log('[support] timeline', snapshot.diagnostics.timeline);
  console.log('[support] sla', {
    stopToUploadComplete: formatDuration(snapshot.diagnostics.sla.stopToUploadCompleteMs),
    stopToProcessing: formatDuration(snapshot.diagnostics.sla.stopToProcessingMs),
    stopToReady: formatDuration(snapshot.diagnostics.sla.stopToReadyMs),
    minimumReadyReached: snapshot.diagnostics.sla.minimumReadyReached,
    fullyReadyReached: snapshot.diagnostics.sla.fullyReadyReached,
  });
  console.log('[support] blockedTracks', snapshot.diagnostics.blockedTracks);
}

main().catch((err) => {
  console.error('[support] FAIL', err);
  process.exit(1);
});
