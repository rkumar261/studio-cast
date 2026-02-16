/*
 * Recording flow acceptance runner (T20 baseline)
 *
 * Usage:
 *   API_BASE=http://localhost:8080 \
 *   AUTH_COOKIE='access_token=...' \
 *   RECORDING_ID='<uuid>' \
 *   ACCEPT_TARGET_PARTICIPANTS=10 \
 *   npm run acceptance:recording
 */

type ProgressResponse = {
  recordingId: string;
  status: 'draft' | 'uploading' | 'processing' | 'ready' | 'error';
  phase: 'recording' | 'uploading' | 'processing' | 'ready' | 'error';
  summary: {
    participantsTotal: number;
    chunksPending: number;
  };
  exports: {
    requiredTotal: number;
    requiredSucceeded: number;
    requiredFailed: number;
  };
};

const API_BASE = process.env.API_BASE ?? 'http://localhost:8080';
const AUTH_COOKIE = process.env.AUTH_COOKIE ?? '';
const RECORDING_ID = process.env.RECORDING_ID ?? process.argv[2] ?? '';
const TARGET_PARTICIPANTS = Number(process.env.ACCEPT_TARGET_PARTICIPANTS ?? '10');
const TIMEOUT_SEC = Number(process.env.ACCEPT_TIMEOUT_SEC ?? '900');
const POLL_MS = Number(process.env.ACCEPT_POLL_MS ?? '5000');

if (!RECORDING_ID) {
  console.error('Missing RECORDING_ID. Set RECORDING_ID env or pass as first argument.');
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

async function run() {
  console.log('[acceptance] start', {
    API_BASE,
    RECORDING_ID,
    TARGET_PARTICIPANTS,
    TIMEOUT_SEC,
    POLL_MS,
  });

  const startedAt = Date.now();
  let seenProcessing = false;
  let seenPendingChunks = false;

  while (Date.now() - startedAt <= TIMEOUT_SEC * 1000) {
    const progress = await getJson<ProgressResponse>(`/v1/recordings/${RECORDING_ID}/progress`);

    if (progress.phase === 'processing') seenProcessing = true;
    if (progress.summary.chunksPending > 0) seenPendingChunks = true;

    const participantsOk = progress.summary.participantsTotal >= TARGET_PARTICIPANTS;
    const exportsReady =
      progress.exports.requiredTotal === 3 &&
      progress.exports.requiredSucceeded === 3 &&
      progress.exports.requiredFailed === 0;
    const chunksDone = progress.summary.chunksPending === 0;
    const recordingReady = progress.status === 'ready' && progress.phase === 'ready';

    console.log('[acceptance] snapshot', {
      phase: progress.phase,
      status: progress.status,
      participants: progress.summary.participantsTotal,
      chunksPending: progress.summary.chunksPending,
      exports: {
        requiredSucceeded: progress.exports.requiredSucceeded,
        requiredTotal: progress.exports.requiredTotal,
        requiredFailed: progress.exports.requiredFailed,
      },
      participantsOk,
      chunksDone,
      exportsReady,
      recordingReady,
    });

    if (participantsOk && chunksDone && exportsReady && recordingReady) {
      console.log('[acceptance] PASS', {
        seenProcessing,
        seenPendingChunks,
      });
      process.exit(0);
    }

    if (progress.phase === 'error' || progress.status === 'error') {
      throw new Error('Recording reached error state before acceptance criteria were met.');
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }

  throw new Error(`Acceptance timed out after ${TIMEOUT_SEC}s without reaching ready criteria.`);
}

run().catch((err) => {
  console.error('[acceptance] FAIL', err);
  process.exit(1);
});
