# Task 18 Automated Regression Suite

This suite targets known regression-prone failure modes from Tasks 06-17 using deterministic service/hook-level tests.

## Coverage Matrix

### Backend regression coverage

- Duplicate initiate/complete idempotency
  - `backend/src/services/track-chunk.service.test.ts`
  - Tests:
    - `initiate same (trackId, seq) twice returns accepted then existing`
    - `complete same chunk twice is idempotent`
    - `initiate recovers from unique conflict race and returns existing row`

- Seq mismatch reconciliation
  - `backend/src/services/track-chunk.service.test.ts`
  - Tests:
    - `seq mismatch returns recovery-friendly payload`
    - `stale seq mismatch returns recovery-friendly payload`

- Finalize gating and validation
  - `backend/src/services/track-finalization.service.test.ts`
  - Tests:
    - `finalize persists final_seq and finalization timestamps`
    - `finalize keeps final seq and finalized_at monotonic on repeat finalize`
    - `finalize rejects invalid final sequence`

- Gap blocking and late chunk handling
  - `backend/src/services/recording-pipeline.service.test.ts`
  - Tests:
    - `finalized track stitches only after chunks 1..finalSeq are uploaded`
    - `non-finalized track is not stitch-ready even when chunks exist`
    - `gap [1,3] blocks stitch`
    - `stop before late final chunk does not enqueue early stitch`

- Guest auth scope enforcement
  - `backend/src/services/track-chunk.service.test.ts`
  - Tests:
    - `guest can upload only own participant track`
    - `guest cannot complete chunk for another participant track`
    - `guest cannot read recovery snapshot for another participant track`

### Frontend regression coverage

- Same-track queue serialization
  - `frontend/src/lib/studio/queue-logic.test.ts`
  - Test: `queue scheduler never selects same-track chunks concurrently`

- Refresh recovery and server-truth seq seeding
  - `frontend/src/lib/studio/recorder-seq.test.ts`
  - Tests:
    - `refresh/reconnect seeds next seq from server truth`
    - `server truth seed does not regress a track that already advanced locally`

- Offline/reconnect retry behavior
  - `frontend/src/lib/studio/queue-logic.test.ts`
  - Tests:
    - `offline retry backoff prevents immediate re-dispatch before reconnect window`
    - `recovery reconcile does not mutate items still marked in-flight on reconnect`

- TUS resume/reconcile behavior
  - `frontend/src/lib/studio/queue-logic.test.ts`
  - Tests:
    - `reconcile applies resumable TUS metadata when server provides it`
    - `TUS retry picks canonical resumable identity before creating fresh upload`

## Test Run Instructions

Backend:

```bash
cd backend
npm run test
```

Frontend hook/unit tests:

```bash
cd frontend
npm run test
```

Recommended CI-style local run:

```bash
cd backend
npm run build
npm run test

cd ../frontend
npm run typecheck
npm run test
```

## Regression-Proof Note

The queue serialization and chunk idempotency tests are explicit regression guards for previously broken behavior (same-track race uploads and duplicate initiate/complete handling).
