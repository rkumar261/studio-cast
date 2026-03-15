# BRD/TRD 06 AI Implementation Guide

## Title
**BRD/TRD 06 - Processing Orchestration, Combined Output Composition, and Project Asset Presentation**

## Source of truth
This guide is derived from:
- BRD 06
- TRD 06

Use those documents as the source of truth if any wording here needs clarification.

> Note: there is no separate BRD/TRD 06 task register in this handoff.
> The task structure below is normalized directly from BRD 06 business requirements and TRD 06 technical phases.

---

## Goal
Complete BRD/TRD 06 correctly by:
- verifying what is already implemented
- finishing partial work
- implementing only what is missing
- avoiding unnecessary rewrites

This scope is about:
- post-upload processing orchestration
- participant source and playback asset generation
- combined output composition
- progressive project readiness
- project asset group presentation
- failure handling and retry-safe convergence

---

## Product intent
After uploads finish, the user should experience:

**upload complete -> processing begins -> project opens -> combined output appears -> participant outputs appear -> optional derivatives continue progressively**

The user should **not** need to understand:
- chunks
- stitch workers
- raw track files
- queue internals
- worker implementation details

Project presentation must prioritize:
- combined output as the primary asset
- participant outputs as first-class asset groups
- clear readiness / failure states
- stable business labels and locators

---

## Core business rules from BRD 06

### User-facing priorities
- Project should become usable **before every optional export finishes**.
- Combined output is a **first-class project asset**.
- Each participant should have their own visible asset group.
- Failures should surface on the affected asset without corrupting unrelated ready assets.
- Guests do **not** need project asset page access unless a later product requirement explicitly introduces it.

### Readiness levels
Use these business readiness levels:

1. **Project minimum ready**
   - combined playback asset is ready
   - at least one participant asset group is ready

2. **Participant ready**
   - that participant's minimum playback asset is ready

3. **Project fully processed**
   - all required exports / configured derivatives are ready or terminally failed with surfaced status

### Presentation rules
Allowed user-facing labels include:
- Combined
- All participants
- participant display names

Do **not** expose labels like:
- stitch raw
- track asset
- worker job
- internal pipeline terms

---

## Canonical technical model from TRD 06

### Processing layers
1. **Ingest**
   - validated participant uploads
   - finalized track ranges
   - materialized chunks/files

2. **Normalization**
   - stable participant source media from raw ingest artifacts

3. **Composition**
   - project-level combined playback output from participant media

4. **Derivatives**
   - WAV, captions, transcript, alternate MP4, thumbnails, etc.

5. **Presentation**
   - stable project asset groups for UI and APIs

### Canonical asset taxonomy
Treat assets as explicit entities, not loose files.

#### User-facing asset groups
- participant source asset
- participant playback asset
- combined playback asset
- export derivative
- transcript artifact

#### Internal-only artifacts
- raw chunk files
- raw stitched files
- transcode intermediates
- worker scratch outputs
- queue/job implementation detail

API rule:
**A file path is not the asset model.**
Expose asset entities with type, scope, readiness, metadata, and playback/download locators.

---

## Derived implementation task order
Implement in this order unless a dependency clearly requires a small adjustment:

1. **06-01 - Canonical processing asset taxonomy and read model**
2. **06-02 - Participant normalization and participant playback orchestration**
3. **06-03 - Combined output composition policy and orchestration**
4. **06-04 - Progressive readiness model and minimum-ready semantics**
5. **06-05 - Project asset API contract and presentation payload**
6. **06-06 - Failure handling, retry/replay convergence, and deterministic asset identity**
7. **06-07 - Derivative pipeline alignment for transcript/captions/secondary exports**
8. **06-08 - Tests, observability, and rollout-safe verification**

---

## Task 06-01 - Canonical processing asset taxonomy and read model

### Objective
Stop treating final outputs as loose files and model them as stable asset groups with a project-facing read model.

### Required behavior
- Introduce or complete explicit asset group representation for:
  - combined playback asset
  - participant asset groups
  - transcript artifact
  - derivative exports
- Maintain a stable read model or index so project UI does not recompute worker state from raw internals.
- Keep ingest storage identity separate from presentation asset identity.

### Acceptance criteria
- Project API can read asset groups without inspecting raw track/chunk state.
- Combined output and participant outputs have stable asset identity.
- File paths are implementation detail, not the public data model.

---

## Task 06-02 - Participant normalization and participant playback orchestration

### Objective
Convert uploaded participant recordings into stable participant source assets and user-facing participant playback assets.

### Required behavior
- Verify ingest completion/finalize gates before participant normalization begins.
- Generate participant source assets from finalized/materialized track media.
- Generate participant playback assets suitable for project playback/download.
- Support graceful degradation:
  - if a participant is audio-only, expose audio-only readiness truthfully
  - do not pretend a video asset exists when it does not

### Acceptance criteria
- Each successfully uploaded participant gets a visible asset group.
- Participant identity is preserved in project presentation.
- Participant readiness can advance independently of other participants.

---

## Task 06-03 - Combined output composition policy and orchestration

### Objective
Generate a deterministic combined playback asset that is the default project playback experience.

### Required behavior
- Define one explicit first-release composition policy.
- Make the policy deterministic for:
  - layout
  - canvas behavior
  - audio mix policy
  - missing participant policy
  - duration policy
- Generate the combined playback asset as a stable project asset, not just an export side effect.
- Keep combined output primary in project presentation.

### Acceptance criteria
- Combined output has a stable business identity.
- Combined readiness is deterministic.
- Missing/failed participant behavior follows explicit policy.
- Combined output becomes playable/downloadable as the primary project asset.

---

## Task 06-04 - Progressive readiness model and minimum-ready semantics

### Objective
Separate minimum-ready from fully-processed and update readiness incrementally.

### Required behavior
- Project should transition to **minimum ready** once:
  - combined playback asset is ready
  - at least one participant asset group is ready
- Optional derivatives must not block minimum-ready.
- Participant asset groups update independently.
- Full processing completion is separate from minimum-ready.
- Failed work items attach to the affected asset group without collapsing unrelated ready state.

### Acceptance criteria
- Project page can open while optional derivatives are still pending.
- Minimum-ready remains stable once achieved.
- Participant rows/cards can become ready earlier or later independently.
- Failure status is scoped to the affected asset.

---

## Task 06-05 - Project asset API contract and presentation payload

### Objective
Expose project data in an asset-first, product-facing structure.

### Required behavior
Return a project contract with distinct groups for:
- `combinedAsset`
- `participantAssets[]`
- `processingSummary`
- `transcript`

Expected fields where applicable:
- id
- type
- state
- durationMs
- width
- height
- playbackUrl
- downloadUrl
- thumbnailUrl
- availableDerivatives[]
- participantId / displayName / role
- minimumReady / fullyProcessed / pendingWork[] / failedWork[]

Do not expose:
- raw chunk lists
- raw stitch artifacts
- worker/job detail
- internal file implementation noise

### Acceptance criteria
- Project UI can render combined and participant outputs from one stable contract.
- Product-facing readiness is explicit.
- Internal worker/storage terminology stays hidden.

---

## Task 06-06 - Failure handling, retry/replay convergence, and deterministic asset identity

### Objective
Ensure processing failures are scoped correctly and retries converge on canonical assets without duplicates.

### Required behavior
- Participant normalization failure should block/fail only that participant asset group unless composition policy says otherwise.
- Combined composition failure should not destroy unrelated participant readiness.
- Optional derivative failure must not block minimum-ready.
- Retries and reprocessing must converge on canonical asset IDs and stable presentation grouping.
- Asset naming/grouping must remain stable across retries.

### Acceptance criteria
- Reprocessing does not create duplicate user-visible asset rows.
- Asset failure stays scoped to the affected group.
- Retry behavior is idempotent at the asset-group level.

---

## Task 06-07 - Derivative pipeline alignment for transcript/captions/secondary exports

### Objective
Move optional and heavier outputs into a derivative layer that does not block project usefulness.

### Required behavior
- Treat transcript, captions, alternate MP4s, WAV, thumbnails, and similar outputs as derivatives or related artifacts.
- Expose them progressively once ready.
- Do not block combined or participant playback readiness on optional derivatives.
- Keep transcript/captions surfaced cleanly when enabled.

### Acceptance criteria
- Project becomes usable before every optional derivative is complete.
- Transcript/captions/secondary exports surface progressively.
- Derivative failure does not roll back minimum-ready.

---

## Task 06-08 - Tests, observability, and rollout-safe verification

### Objective
Lock the orchestration and project asset model into tests and diagnostics so it can evolve safely.

### Required behavior
- Add/update tests for:
  - participant asset readiness
  - combined output readiness
  - minimum-ready vs fully-processed
  - failure scoping
  - retry/replay convergence
  - project API contract behavior
- Ensure observability can attribute work and failures to:
  - recording
  - participant
  - track
  - asset/output scope
- Keep operator diagnostics separate from product-facing APIs.

### Acceptance criteria
- Regressions in readiness, composition, or project asset presentation are caught automatically.
- Operators can inspect failures without exposing internals to end users.
- Rollout can proceed without destabilizing existing BRD 02-05 flows.

---

## Cross-cutting rules
- Do not rebuild already-working BRD 02, BRD 03, BRD 04, or BRD 05 flows unnecessarily.
- Prefer minimal, focused changes over broad rewrites.
- Combined output is the primary project playback asset.
- Participant asset groups are first-class and must remain attributable by participant identity.
- Product APIs must stay asset-first and user-facing.
- Internal pipeline artifacts must remain internal.
- Minimum-ready and fully-processed must remain separate concepts.
- Guests should not gain project asset page access unless explicitly required by a later BRD.
- Retries and reprocessing must converge on stable asset identity.
- Add/update tests for every changed behavior.

---

## Suggested implementation checklist
For each task:
1. verify current implementation
2. classify as:
   - implemented
   - partially implemented
   - missing
3. implement only missing/partial pieces
4. add tests
5. record concise verification notes

---

## Output format expected from the coding agent

### Compliance Matrix
| Task | Status | Evidence | Missing Work | Files |

### Implementation Plan
- task order
- files to update
- tests to add/update

### Code Changes Made
- Backend
- Frontend/Client alignment if affected
- DTO/contracts
- Schema/Migrations if applicable
- Observability/diagnostics
- Tests
- Docs/notes if applicable

### Verification
- tests added/updated
- what passed
- remaining risks or intentional deferrals
