# BRD/TRD 08 QA Traceability Matrix

This document is the BRD/TRD 08 acceptance and regression index for BRD/TRD 01-07.

Use it to answer:
- which journeys are covered automatically
- which journeys still require manual/browser validation
- which runbook applies when a journey fails
- which release gate the evidence satisfies

## Traceability Rules

- Scenario IDs use the canonical groups from BRD/TRD 08:
  - `HOST-CORE-*`
  - `GUEST-CORE-*`
  - `UPLOAD-RECOVERY-*`
  - `FINALIZE-PROCESS-*`
  - `PROJECT-ASSET-*`
  - `AUTHZ-*`
  - `RB-*`
- Every critical user-visible state must map to:
  - persisted truth
  - observable signal
  - at least one verification mechanism
- Manual-only items are explicit instead of implied.

## Acceptance Matrix

| Scenario ID | Journey | Automated Evidence | Manual / E2E Evidence | Release Gates | Runbook / Incident |
| --- | --- | --- | --- | --- | --- |
| `HOST-CORE-001` | Host can create, start, stop, and reach upload handoff | [recording-session.service.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/services/recording-session.service.test.ts), [recording-progress.service.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/services/recording-progress.service.test.ts) | [recording-acceptance.md](/Users/rakeshkumar/dev/projects/studio-cast/docs/recording-acceptance.md) host flow checklist | Gate 2, Gate 5 | `RB-01`, `RB-02` |
| `HOST-CORE-002` | Host remains in studio during post-stop upload and only hands off when consumer progress allows it | [recordings.progress.routes.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/routes/recordings.progress.routes.test.ts), [recording-pipeline.service.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/services/recording-pipeline.service.test.ts) | [brd-trd-08-scenario-pack.md](/Users/rakeshkumar/dev/projects/studio-cast/docs/brd-trd-08-scenario-pack.md) `HOST-CORE-002` | Gate 2, Gate 3 | `RB-01`, `RB-02` |
| `GUEST-CORE-001` | Guest joins from invite without login and reaches studio | [participants.routes.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/routes/participants.routes.test.ts), [livekit.routes.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/routes/livekit.routes.test.ts), [guest-join.spec.ts](/Users/rakeshkumar/dev/projects/studio-cast/tests/e2e/guest-join.spec.ts) | [brd-trd-08-scenario-pack.md](/Users/rakeshkumar/dev/projects/studio-cast/docs/brd-trd-08-scenario-pack.md) `GUEST-CORE-001` | Gate 2, Gate 5 | `RB-04` |
| `GUEST-CORE-002` | Guest required-name and optional-email prejoin behavior | [participants.routes.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/routes/participants.routes.test.ts), [guest-join.spec.ts](/Users/rakeshkumar/dev/projects/studio-cast/tests/e2e/guest-join.spec.ts) | [brd-trd-08-scenario-pack.md](/Users/rakeshkumar/dev/projects/studio-cast/docs/brd-trd-08-scenario-pack.md) `GUEST-CORE-002` | Gate 2 | `RB-04` |
| `GUEST-CORE-003` | Guest leave/upload-complete path lands on thanks flow and stays project-safe | [recordings.progress.routes.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/routes/recordings.progress.routes.test.ts), [project-assets.routes.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/routes/project-assets.routes.test.ts), [guest-leave.spec.ts](/Users/rakeshkumar/dev/projects/studio-cast/tests/e2e/guest-leave.spec.ts) | [brd-trd-08-scenario-pack.md](/Users/rakeshkumar/dev/projects/studio-cast/docs/brd-trd-08-scenario-pack.md) `GUEST-CORE-003` | Gate 2, Gate 5 | `RB-04` |
| `UPLOAD-RECOVERY-001` | Chunk initiate is idempotent | [track-chunk.service.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/services/track-chunk.service.test.ts) | [brd-trd-08-scenario-pack.md](/Users/rakeshkumar/dev/projects/studio-cast/docs/brd-trd-08-scenario-pack.md) `UPLOAD-RECOVERY-004` | Gate 2, Gate 3 | `RB-01` |
| `UPLOAD-RECOVERY-002` | Chunk complete is idempotent | [track-chunk.service.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/services/track-chunk.service.test.ts) | [brd-trd-08-scenario-pack.md](/Users/rakeshkumar/dev/projects/studio-cast/docs/brd-trd-08-scenario-pack.md) `UPLOAD-RECOVERY-004` | Gate 2, Gate 3 | `RB-01` |
| `UPLOAD-RECOVERY-003` | Recovery returns canonical next expected sequence and contiguous-upload truth | [track-chunk.service.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/services/track-chunk.service.test.ts) | [brd-trd-08-scenario-pack.md](/Users/rakeshkumar/dev/projects/studio-cast/docs/brd-trd-08-scenario-pack.md) `UPLOAD-RECOVERY-005` | Gate 3 | `RB-01` |
| `UPLOAD-RECOVERY-004` | Queue ordering and duplicate retry do not create divergent logical chunks | [track-chunk.service.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/services/track-chunk.service.test.ts) | [brd-trd-08-scenario-pack.md](/Users/rakeshkumar/dev/projects/studio-cast/docs/brd-trd-08-scenario-pack.md) `UPLOAD-RECOVERY-005` | Gate 3 | `RB-01` |
| `FINALIZE-PROCESS-001` | Finalize persists monotonic final sequence and timestamps | [track-finalization.service.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/services/track-finalization.service.test.ts) | [recording-acceptance.md](/Users/rakeshkumar/dev/projects/studio-cast/docs/recording-acceptance.md) reconnect and delayed-processing scenarios | Gate 2, Gate 3 | `RB-01`, `RB-02` |
| `FINALIZE-PROCESS-002` | Stitch/readiness gating waits for contiguous uploaded chunks through `finalSeq` | [recording-pipeline.service.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/services/recording-pipeline.service.test.ts), [recording-readiness.service.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/services/recording-readiness.service.test.ts) | [brd-trd-08-scenario-pack.md](/Users/rakeshkumar/dev/projects/studio-cast/docs/brd-trd-08-scenario-pack.md) `FINALIZE-PROCESS-003` | Gate 3 | `RB-02`, `RB-03` |
| `FINALIZE-PROCESS-003` | Late completion after stop stays upload-first before processing advances | [recording-pipeline.service.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/services/recording-pipeline.service.test.ts), [recordings.progress.routes.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/routes/recordings.progress.routes.test.ts) | [brd-trd-08-scenario-pack.md](/Users/rakeshkumar/dev/projects/studio-cast/docs/brd-trd-08-scenario-pack.md) `FINALIZE-PROCESS-003` | Gate 3 | `RB-01`, `RB-02` |
| `PROJECT-ASSET-001` | Owner project page keeps combined output primary and participant assets first-class | [project-assets.routes.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/routes/project-assets.routes.test.ts), [project-page.spec.ts](/Users/rakeshkumar/dev/projects/studio-cast/tests/e2e/project-page.spec.ts) | [brd-trd-08-scenario-pack.md](/Users/rakeshkumar/dev/projects/studio-cast/docs/brd-trd-08-scenario-pack.md) `PROJECT-ASSET-001` | Gate 2, Gate 5 | `RB-03`, `RB-05` |
| `PROJECT-ASSET-002` | Minimum-ready remains separate from fully-processed | [project-assets.routes.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/routes/project-assets.routes.test.ts), [recording-readiness.service.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/services/recording-readiness.service.test.ts) | [recording-acceptance.md](/Users/rakeshkumar/dev/projects/studio-cast/docs/recording-acceptance.md) processing checks | Gate 2, Gate 3 | `RB-02`, `RB-05` |
| `PROJECT-ASSET-003` | Pending and failed downstream work are visible without exposing internals | [project-assets.routes.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/routes/project-assets.routes.test.ts) | [brd-trd-08-scenario-pack.md](/Users/rakeshkumar/dev/projects/studio-cast/docs/brd-trd-08-scenario-pack.md) `PROJECT-ASSET-003` | Gate 2, Gate 4 | `RB-05` |
| `AUTHZ-001` | Guest is participant-scoped and cannot act on another participant | [participants.service.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/services/participants.service.test.ts), [recordings.progress.routes.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/routes/recordings.progress.routes.test.ts), [participants.routes.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/routes/participants.routes.test.ts) | [brd-trd-08-scenario-pack.md](/Users/rakeshkumar/dev/projects/studio-cast/docs/brd-trd-08-scenario-pack.md) `AUTHZ-001` | Gate 2, Gate 3 | `RB-04` |
| `AUTHZ-002` | Guest cannot access owner project/admin/diagnostic routes | [project-assets.routes.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/routes/project-assets.routes.test.ts), [recordings.progress.routes.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/routes/recordings.progress.routes.test.ts), [project-page.spec.ts](/Users/rakeshkumar/dev/projects/studio-cast/tests/e2e/project-page.spec.ts) | [brd-trd-08-scenario-pack.md](/Users/rakeshkumar/dev/projects/studio-cast/docs/brd-trd-08-scenario-pack.md) `AUTHZ-002` | Gate 2, Gate 5 | `RB-04` |

## Automated Regression Coverage Audit

| Mandatory Area | Status | Primary Automated Evidence | Notes |
| --- | --- | --- | --- |
| chunk initiate | Implemented | [track-chunk.service.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/services/track-chunk.service.test.ts) | Covers first-write and idempotent replay. |
| chunk complete | Implemented | [track-chunk.service.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/services/track-chunk.service.test.ts) | Covers repeated complete and contiguous recovery hints. |
| duplicate/idempotent retry | Implemented | [track-chunk.service.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/services/track-chunk.service.test.ts) | Includes unique-conflict recovery path. |
| recovery | Implemented | [track-chunk.service.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/services/track-chunk.service.test.ts) | Uses canonical `nextExpectedSeq`. |
| queue ordering | Implemented | [track-chunk.service.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/services/track-chunk.service.test.ts) | Ordering is validated at service layer rather than UI. |
| finalize | Implemented | [track-finalization.service.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/services/track-finalization.service.test.ts) | Monotonic finalization is covered. |
| readiness gating | Implemented | [recording-readiness.service.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/services/recording-readiness.service.test.ts) | Asset-centric readiness is covered. |
| late completion after stop | Implemented | [recording-pipeline.service.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/services/recording-pipeline.service.test.ts) | Prevents premature stitch enqueueing. |
| combined asset gating | Implemented | [combined-asset.service.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/services/combined-asset.service.test.ts) | Deterministic combined gating and failure paths are covered. |
| authorization boundaries | Implemented | [participants.routes.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/routes/participants.routes.test.ts), [recordings.progress.routes.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/routes/recordings.progress.routes.test.ts), [project-assets.routes.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/routes/project-assets.routes.test.ts) | Covers guest/owner separation. |
| project presentation contract | Implemented | [project-assets.routes.test.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/routes/project-assets.routes.test.ts), [project-page.spec.ts](/Users/rakeshkumar/dev/projects/studio-cast/tests/e2e/project-page.spec.ts) | Route contract is automated; browser rendering gets a smoke layer. |

## Explicit Manual-Only Coverage

These areas remain manual by design because browser/media/network realism is the point of the check:

- `HOST-CORE-003`: host + multiple guests in one real room
- `GUEST-CORE-004`: intermittent guest network during upload
- `UPLOAD-RECOVERY-005`: offline/reconnect during post-stop upload
- `FINALIZE-PROCESS-004`: workers running in dependency order on real media
- `PROJECT-ASSET-004`: transcript and captions UX on real transcript data

Use [brd-trd-08-scenario-pack.md](/Users/rakeshkumar/dev/projects/studio-cast/docs/brd-trd-08-scenario-pack.md) for the execution checklist.
