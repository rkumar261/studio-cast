# BRD/TRD 05 AI Implementation Guide

## Title
**BRD/TRD 05 - Recording State Machine, API Contracts, and Canonical Data Model**

## Source of truth
This guide is derived from:
- BRD 05
- TRD 05
- BRD/TRD 05 Implementation Task Register

Use those documents as the source of truth if any wording here needs clarification.

---

## Goal
Complete BRD/TRD 05 correctly by:
- verifying what is already implemented
- finishing partial work
- implementing only what is missing
- avoiding unnecessary rewrites

This scope is about **canonical lifecycle truth**, **idempotent upload/recovery/finalize contracts**, **authorization boundaries**, **processing gates**, **asset-first project APIs**, **observability**, **backward-safe migration**, and **regression coverage**.

---

## Canonical business intent
Standardize recording behavior end-to-end so host flow, guest flow, upload behavior, processing, project presentation, and downstream exports all operate from one canonical set of states and contracts.

Every important lifecycle transition must have:
- one explicit truth source
- deterministic retry/recovery behavior
- permission-safe API boundaries
- clean separation between product-facing states and operator-facing diagnostics

---

## Canonical business entities
Use these as the conceptual model:

- **Studio**: live environment where host and guests join and record
- **Recording session**: bounded live capture event
- **Participant**: host or guest contributing media
- **Track**: one participant media stream (`audio`, `video`, `screen`)
- **Track chunk**: ordered upload fragment for a track
- **Recording asset**: processed media artifact from one or more tracks
- **Project**: post-upload presentation container for reusable outputs
- **Invite**: guest entry control for invite-bound participation

Do not let alternative runtime shortcuts replace these canonical meanings.

---

## Canonical lifecycle expectations

### Recording lifecycle
Allowed business lifecycle:
- `created`
- `prejoin`
- `idle`
- `recording`
- `post_stop_uploading`
- `upload_complete`
- `processing`
- `ready`
- `blocked`

### Track lifecycle
Expected technical lifecycle:
- `recording`
- `capture_closed`
- `finalized`
- `ready_for_stitch`
- `stitched`
- `processed`
- `blocked`

### Chunk lifecycle
Expected technical lifecycle:
- `initiated`
- `uploading`
- `uploaded`
- `failed`

Each user-visible lifecycle question must have one canonical truth source.
Do not let UI-only booleans or timing assumptions define business truth.

---

## Canonical truth rules
These questions must have one explicit answer source:

- **Has recording started?**
  - `recording.state`, not project readiness
- **Has a participant finished upload?**
  - participant/track upload completion truth, not guessed UI percentage
- **Is session upload complete?**
  - all required participant uploads complete
- **Can processing start?**
  - upload complete + explicit processing gate rules
- **Is project ready?**
  - required user-facing outputs marked ready
- **Can guest access project administration?**
  - no, unless explicitly elevated by business policy

---

## Task baseline and execution order
Implement in this order unless a dependency clearly forces a small adjustment:

1. **05-01 - Canonical lifecycle truth alignment**
2. **05-02 - Idempotent upload, recovery, and finalize API contracts**
3. **05-03 - Authorization model enforcement for host and guest boundaries**
4. **05-04 - Processing gate enforcement and blocked-reason model**
5. **05-05 - Project/details API contract and canonical asset presentation payload**
6. **05-06 - Observability and diagnostics for lifecycle truth**
7. **05-07 - Backward-compatible migration and rollout alignment**
8. **05-08 - Lifecycle regression and contract test suite**

---

## Task 05-01 - Canonical lifecycle truth alignment

### Objective
Establish one explicit lifecycle truth for recording, participant contribution, track, and chunk progression so studio, processing, project APIs, and QA refer to the same state vocabulary.

### Required behavior
- Finalize canonical lifecycle fields and transitions for recording, track, and chunk entities.
- Align session, upload, post-stop upload, processing, ready, and blocked semantics to the canonical model.
- Ensure state ownership is explicit:
  - recording state
  - track state
  - chunk state
  - asset readiness
- Do not let these conflict.
- Document allowed state transitions and truth source for each transition.

### Acceptance criteria
- Recording, track, and chunk lifecycle states are explicit and non-contradictory.
- No important lifecycle transition relies on UI-only state.
- Product, QA, and engineering can identify one truth source per lifecycle question.
- State model reference exists in code comments or docs.

---

## Task 05-02 - Idempotent upload, recovery, and finalize API contracts

### Objective
Complete the canonical contract for track registration, chunk initiate, chunk complete, recovery, finalize, and stop session so retry/reconnect paths are safe.

### Required behavior
- Verify or implement idempotent:
  - track registration
  - initiate
  - complete
  - recovery
  - finalize
- Return reconciliation-aware responses for stale or ahead-of-server sequence cases.
- Expose reconciliation fields where relevant:
  - `highestExistingSeq`
  - `highestContiguousUploadedSeq`
  - `nextExpectedSeq`
- Ensure stop session moves recording into `post_stop_uploading`, not directly into processing readiness.

### Acceptance criteria
- Same `(trackId, seq)` initiate cannot create duplicate logical chunk rows.
- Complete can be called twice safely.
- Recovery contract returns usable reconciliation hints.
- Finalize remains explicit and idempotent.
- DTOs/contracts and tests reflect this behavior.

---

## Task 05-03 - Authorization model enforcement for host and guest boundaries

### Objective
Enforce canonical authorization:
- host manages recording/project scope
- guest is limited to join/session participation and own uploads/recovery

### Required behavior
- Audit and tighten host vs guest permissions on:
  - session
  - track
  - upload
  - recovery
  - project APIs
- Ensure guest APIs are participant-scoped and recording-scoped only where explicitly allowed.
- Separate normal product APIs from admin/operator-only diagnostics or management surfaces.
- Add tests for forbidden cross-participant and cross-project access.

### Acceptance criteria
- Guest cannot manage another participant's tracks/uploads.
- Guest does not gain project administration access by default.
- Host retains full recording/project management scope.
- API boundaries reflect the canonical authorization model.

---

## Task 05-04 - Processing gate enforcement and blocked-reason model

### Objective
Make every processing stage start only when its canonical gate is satisfied, and make blocked reasons explicit for recovery and diagnostics.

### Required behavior
- Enforce `ready_for_stitch(track)` only when:
  - track finalized
  - `final_seq > 0`
  - chunks `1..final_seq` all uploaded/materialized
  - no gaps
- Enforce downstream gates for:
  - transcode
  - compose
  - export
  - overall `ready`
- Persist and expose blocked reasons when a track or recording cannot progress.
- Ensure late chunk arrival and retry behavior do not reopen open-ended processing incorrectly.

### Acceptance criteria
- No processing stage starts before its canonical gate condition is satisfied.
- Blocked reasons are explicit and queryable.
- Gapful or non-finalized tracks cannot stitch.
- Ready state depends on required user-facing outputs, not upload timing alone.

---

## Task 05-05 - Project/details API contract and canonical asset presentation payload

### Objective
Expose project details in an asset-first structure so UI can show combined outputs and participant outputs without leaking raw pipeline artifacts.

### Required behavior
- Return combined outputs separately from participant-specific outputs.
- Map internal lifecycle/processing state to user-facing readiness vocabulary.
- Include enough metadata for:
  - labels
  - readiness
  - durations
  - previews
  - allowed actions
- Keep raw chunk lists, raw stitch internals, and worker-specific noise out of normal product payloads.

### Acceptance criteria
- Project APIs present combined and participant outputs distinctly.
- UI does not need raw chunk or raw stitch data to know readiness.
- User-facing states are explicit and stable.
- Internal pipeline artifacts are hidden from the normal product contract.

---

## Task 05-06 - Observability and diagnostics for lifecycle truth

### Objective
Expose enough diagnostic detail for operators and QA to validate lifecycle correctness without mixing operator detail into product payloads.

### Required behavior
- Add or verify structured fields for:
  - `highest seq`
  - `highest contiguous uploaded seq`
  - `final_seq`
  - missing seqs
  - blocked reasons
- Make job execution attributable to:
  - recording
  - participant
  - track
  - output scope
- Ensure client-relevant recovery errors are structured and actionable.
- Keep operator diagnostics separate from product-facing states.

### Acceptance criteria
- Operators can inspect lifecycle correctness without reading raw storage state.
- Client recovery UX can react deterministically to structured errors.
- Product-facing APIs remain clean while operator detail remains available separately.

---

## Task 05-07 - Backward-compatible migration and rollout alignment

### Objective
Move current implementation toward the canonical model without breaking active development flows or existing saved data.

### Required behavior
- Audit legacy fields and state signals still used by runtime code.
- Add canonical fields and models in a backward-safe rollout sequence.
- Document which services still read legacy fields and what later tasks must migrate.
- Ensure migration order does not require a full rewrite.

### Acceptance criteria
- Migration files and rollout notes exist if required.
- Compatibility map of legacy vs canonical fields exists in code comments or docs.
- Current dev environment can adopt the canonical model without destructive breakage.
- Legacy assumptions are documented rather than hidden.

---

## Task 05-08 - Lifecycle regression and contract test suite

### Objective
Lock lifecycle, contract, and permission model into tests so later tasks cannot silently regress the foundation.

### Required behavior
- Add or expand tests for:
  - recording lifecycle progression
  - upload recovery
  - finalize gating
  - blocked states
  - authorization boundaries
- Cover project API contract behavior for:
  - combined outputs
  - participant outputs
- Cover guest permission enforcement and recovery/error contract paths.
- Assert canonical lifecycle vocabulary and truth-source expectations.

### Acceptance criteria
- Lifecycle regressions are caught by automated tests.
- Project API contract remains asset-based and permission-safe.
- Guest permissions and upload/finalize/recovery flows remain deterministic.
- Canonical lifecycle model can evolve later without redefinition.

---

## Canonical API behavior reminders

### Session and participation
- GET session must return enough detail for studio rendering.
- Guest join/handshake accepts:
  - required name
  - optional email
  - invite token
  - device/session metadata
- Must not require login.
- Register track must be idempotent for `(participant, kind)` under allowed role constraints.

### Upload and recovery
- `initiate chunk` must be idempotent on `(trackId, seq)`.
- `complete chunk` must only mark uploaded after successful materialization.
- Recovery must return reconciliation hints sufficient for client resumption.
- Finalize track is explicit.
- Stop session moves recording into post-stop upload, not processing-ready directly.

### Project and output retrieval
- Project/details APIs must return:
  - combined outputs
  - participant-specific outputs
- User-facing APIs must not expose:
  - raw chunk internals
  - raw stitch internals
  - internal pipeline artifacts
- Status fields returned to studio/project must map to the canonical lifecycle vocabulary.

---

## Canonical asset taxonomy
Treat these as the user-facing/internal distinction:

### User-facing
- `participant_video`
- `participant_audio` (if product offer requires it)
- `combined_program_video`
- `captions`
- `transcript`

### Internal only
- `raw_track_stitch`
- `transcode_intermediate`
- other operational artifacts

Do not surface internal-only artifacts in the normal project contract.

---

## Cross-cutting rules
- Do not rebuild already-working BRD 02, BRD 03, or BRD 04 flows unnecessarily.
- Prefer minimal, focused changes over broad rewrites.
- Keep lifecycle truth explicit and machine-evaluable.
- Separate product-facing states from operator-facing diagnostics.
- Keep guest permissions invite-bound, participant-scoped, and project-safe.
- Preserve TUS/live resumable upload as the canonical live transport path.
- Restrict multipart to manual/import workflows only.
- If schema changes are needed, make them additive and rollout-safe.
- Add or update tests for every changed behavior.

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
- Schema/Migrations
- Observability/diagnostics
- Tests
- Docs/notes if applicable

### Verification
- tests added/updated
- what passed
- remaining risks or intentional deferrals
