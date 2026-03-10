# Task 17 Observability Baseline

This document defines the lightweight telemetry baseline for local debugging of recording upload and media processing flows.

## Structured Event Contract

All new telemetry events emit structured JSON fields with this minimum shape:

- `ts`: ISO timestamp
- `level`: `info` | `warn` | `error`
- `event`: stable event name
- Correlation IDs where applicable:
  - `recordingId`
  - `sessionId`
  - `participantId`
  - `trackId`
  - `chunkId`
  - `assetId`
  - `jobId`

## Minimal Telemetry Events

Event list is implemented in `backend/src/lib/telemetry.ts`:

- `guest.bootstrap.accepted`
- `guest.claim.accepted`
- `guest.joined.session`
- `recording.session.started`
- `recording.session.stopped`
- `track.finalized`
- `upload.recovery.snapshot`
- `upload.chunk.completed`
- `upload.chunk.failed`
- `upload.participant.completed`
- `stitch.started`
- `stitch.finished`
- `stitch.failed`
- `asset.participant.ready`
- `asset.participant.failed`
- `asset.combined.ready`
- `asset.combined.failed`
- `transcript.ready`
- `transcript.failed`
- `export.ready`
- `export.failed`

Worker operational lifecycle emits additional helper events:

- `worker.started`
- `worker.job.running`
- `worker.job.succeeded`
- `worker.job.failed`
- `worker.loop.error`
- `worker.stopped`
- `worker.fatal`

## Local Query Recipes

Start backend and capture logs:

```bash
cd backend
npm run dev | tee /tmp/studio-backend.log
```

Trace a single recording end-to-end:

```bash
jq -c 'select(.recordingId=="<RECORDING_ID>") | {ts,event,recordingId,participantId,trackId,chunkId,assetId,jobId,reason,errorMessage}' /tmp/studio-backend.log
```

Upload pipeline only:

```bash
jq -c 'select((.event // "") | startswith("upload.")) | {ts,event,recordingId,participantId,trackId,chunkId,reason,errorMessage}' /tmp/studio-backend.log
```

Processing pipeline only (stitch + assets + transcript + export):

```bash
jq -c 'select((.event // "") | test("^(stitch\\.|asset\\.|transcript\\.|export\\.)")) | {ts,event,recordingId,trackId,assetId,jobId,reason,errorMessage}' /tmp/studio-backend.log
```

Failed events only:

```bash
jq -c 'select((.level=="error") or ((.event // "") | endswith(".failed")))' /tmp/studio-backend.log
```

Quick counters by event:

```bash
jq -r '.event // empty' /tmp/studio-backend.log | sort | uniq -c | sort -nr
```
