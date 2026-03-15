# BRD/TRD 07 AI Implementation Guide

## Title
**BRD/TRD 07 - Delivery Plan, Migration Strategy, and Implementation Workstreams**

## Source of truth
This guide is derived from:
- BRD 07
- TRD 07

Use those documents as the source of truth if any wording here needs clarification.

> Note: this BRD/TRD is not a feature-only spec.  
> It is the delivery and migration source of truth for how BRD/TRD 01-06 should be rolled out without destabilizing the current product.

---

## Goal
Complete BRD/TRD 07 correctly by:
- verifying what is already implemented
- identifying what remains incomplete across workstreams
- implementing only the missing or partial delivery/migration/operational pieces
- avoiding unnecessary rewrites

This scope is about:
- phased rollout control
- migration-safe implementation
- compatibility handling
- workstream separation
- release sequencing
- rollback boundaries
- diagnostics, telemetry, and runbooks
- definition-of-done validation across BRD/TRD 01-06

---

## Product and delivery intent
The system must move from a prototype-oriented implementation to a stable, user-complete Riverside-style product **without repeated scope drift**.

Delivery success means:
- host flow is predictable from studio entry to usable project page
- guest flow works without mandatory login and ends with clear upload completion
- project page shows combined output plus participant-specific outputs clearly
- upload/process readiness is deterministic
- rollout can happen in phases with compatibility and rollback controls
- future work is spec-driven instead of prompt-driven improvisation

---

## Delivery principles

### 1. Single canonical live upload path
- TUS remains the canonical live upload path.
- Multipart is not treated as equivalent for the same live studio flow.
- Multipart may remain only for manual/import flows.

### 2. User-visible completion over internal optimism
- Do not claim a project is ready before readiness rules are actually satisfied.
- Asset readiness must drive project readiness.

### 3. Backward-compatible migration
- Introduce additive schema/model changes first.
- Use compatibility layers where old and new representations temporarily coexist.
- Do not break existing recordings or environments to force the new model.

### 4. Role clarity
- Host, guest, participant, project viewer, and internal operator responsibilities must remain explicit.
- Guest access must remain invite-bound and participant-scoped unless later requirements expand it.

### 5. Spec-driven execution
- Work should trace back to BRD/TRD 01-07.
- Deviations must be documented, not silently improvised.

---

## Canonical workstreams
Use these workstreams to organize missing work.

### WS1 - Studio and session flow
Stabilize:
- host entry
- guest entry
- prejoin
- recording
- stop
- upload
- handoff to project

### WS2 - Live upload and recovery
Harden:
- TUS upload
- per-track queue serialization
- reconciliation
- resume/recovery
- finalization correctness

### WS3 - Processing and combined output
Make deterministic:
- participant assets
- combined project asset
- processing gates
- asset readiness

### WS4 - Project and asset presentation
Present clearly:
- project page
- combined output
- participant outputs
- readiness and failure states

### WS5 - Authorization and guest participation
Ensure:
- no-login guest flow
- participant-scoped authorization
- host/guest/project boundaries

### WS6 - Quality, telemetry, and operations
Add:
- metrics
- alerts
- dashboards
- runbooks
- regression coverage
- support tooling
- rollout controls

---

## Phased rollout model
Use this rollout sequence as the default execution order.

### Phase 1 - Stabilize current flow
Focus:
- live upload correctness
- recovery
- finalize gating
- deterministic progress truth

Phase closes only when:
- no same-track upload collisions
- recovery works
- finalize gates stitch/processing correctly
- progress reflects truth

### Phase 2 - Complete project outputs
Focus:
- combined project asset
- participant outputs
- project usability after upload

Phase closes only when:
- combined output is first-class
- participant outputs appear consistently on project page

### Phase 3 - Guest-first experience
Focus:
- no-login guest flow
- participant-scoped auth
- guest upload completion UX

Phase closes only when:
- guest can join, record, upload, and appear correctly in outputs without host security regressions

### Phase 4 - Product polish and operations
Focus:
- UX refinement
- telemetry
- retries
- support tools
- rollout safety
- operational confidence

Phase closes only when:
- support burden drops
- rollout can broaden without instability

---

## Release sequencing model
Use these release slices when planning implementation.

### R1 - Ingest stabilization
Deliver:
- recovery APIs
- queue hardening
- schema support for finalization
- deterministic progress

Rollback boundary:
- can disable new recovery/finalize flows while keeping base upload path

### R2 - Processing truth
Deliver:
- canonical processing states
- combined output generation
- asset readiness contracts

Rollback boundary:
- can disable new project asset view while retaining background processing

### R3 - Guest model
Deliver:
- no-login guest join
- participant-scoped upload auth
- guest completion UX

Rollback boundary:
- can revert guest token issuance without affecting host-only studios

### R4 - Project UX and operations
Deliver:
- final project presentation
- telemetry
- backfill
- support tooling
- acceptance pack

Rollback boundary:
- can disable new presentation slices independently from ingest/processing core

---

## Migration strategy

### Schema-first rollout
- Additive migrations first
- nullable fields / new tables before strict enforcement
- tracked migrations only, no hidden shared-env db push

### Dual-read / controlled-write
- Temporary dual-read is allowed where legacy and canonical representations coexist
- Converge to single-write as quickly as safely possible
- Do not leave permanent ambiguous truth sources

### Feature flags
Use explicit flags where needed for:
- new project presentation
- guest auth model
- combined-output pipeline
- rollout slices or kill switches

### Backfill jobs
- Backfill only where safe and deterministic
- Unknown historical state must remain explicit, not guessed
- Backfill scripts must be idempotent and resumable

### Kill switches
- Retain the ability to disable new presentation or processing features independently if issues appear
- Do not require a full platform rollback to mitigate one feature slice

---

## Compatibility and removal plan

### Keep temporarily
- legacy upload/admin pages for diagnostics only
- compatibility handling for mixed-state data during rollout

### Modify
- state model
- finalize semantics
- project presentation
- combined-output generation
- guest identity model
- upload completion UX

### Remove / deprecate as canonical behavior
- multipart as equivalent live-recording path
- ambiguous upload-complete claims before project readiness
- admin-style pages as user-facing project experience
- owner-only participation rules where guest upload is required

---

## Derived implementation task order
Implement in this order unless a dependency clearly requires a small adjustment:

1. **07-01 - Workstream and phase completion audit across BRD/TRD 01-06**
2. **07-02 - Rollout flags, compatibility layers, and rollback boundaries**
3. **07-03 - Migration and backfill plan implementation**
4. **07-04 - Operator diagnostics, telemetry, and support tooling**
5. **07-05 - Runbooks, release checklist, and acceptance pack**
6. **07-06 - Removal/deprecation of conflicting legacy product surfaces**
7. **07-07 - Program-level regression and validation matrix**
8. **07-08 - Governance notes and documented definition of done**

---

## Task 07-01 - Workstream and phase completion audit across BRD/TRD 01-06

### Objective
Turn the product foundation work from BRD/TRD 01-06 into a structured completion audit organized by workstream and release phase.

### Required behavior
- Audit current implementation against:
  - WS1 studio/session flow
  - WS2 upload/recovery
  - WS3 processing/combined output
  - WS4 project/asset presentation
  - WS5 guest auth/participation
  - WS6 quality/operations
- Classify each workstream and each rollout phase as:
  - implemented
  - partially implemented
  - missing
- Identify dependencies that still block a safe phase close.

### Acceptance criteria
- A workstream matrix exists.
- A phase-close matrix exists.
- Remaining implementation items are tied to a workstream and release phase.

---

## Task 07-02 - Rollout flags, compatibility layers, and rollback boundaries

### Objective
Make rollout safe by ensuring important delivery slices can be enabled/disabled deliberately.

### Required behavior
- Identify where feature flags or compatibility toggles are still needed.
- Add/document flags for:
  - project presentation slices
  - guest model slices
  - combined-output pipeline slices
  - diagnostics visibility where needed
- Document rollback boundary for each release slice.
- Ensure mixed-state data does not break normal flows during rollout.

### Acceptance criteria
- Rollout flags or explicit no-flag decisions are documented.
- Rollback boundary is documented per release slice.
- Compatibility handling for mixed-state data is explicit.

---

## Task 07-03 - Migration and backfill plan implementation

### Objective
Provide a safe migration path for schema, lifecycle, asset, and readiness changes.

### Required behavior
- Audit additive migrations already introduced in BRD/TRD 01-06.
- Add missing migration notes, backfill jobs, or compatibility comments where rollout is incomplete.
- Distinguish deterministic backfill from unknown historical state.
- Ensure migration and backfill logic is idempotent/resumable if implemented.

### Acceptance criteria
- Migration plan or notes exist for relevant schema additions.
- Backfill behavior is documented or implemented only where safe.
- Unknown historical state is not guessed silently.

---

## Task 07-04 - Operator diagnostics, telemetry, and support tooling

### Objective
Ensure operators can understand stuck uploads, blocked processing, mixed-state migration issues, and guest auth issues without exposing internals to end users.

### Required behavior
- Verify or add operator-visible diagnostics for:
  - upload/recovery truth
  - lifecycle/blocked reasons
  - processing readiness and failures
  - guest auth/denial issues
- Ensure metrics/logs cover:
  - recording level
  - track level
  - chunk level
  - asset level
  - stage durations where possible
- Keep diagnostics separate from normal product APIs/pages.

### Acceptance criteria
- Operators can answer why a recording/project is not ready.
- Client/product payloads stay clean.
- Support tooling/runbook references exist or are added.

---

## Task 07-05 - Runbooks, release checklist, and acceptance pack

### Objective
Provide the operational documentation needed to release and support the system safely.

### Required behavior
- Add or update docs for:
  - upload/recovery issues
  - processing issues
  - guest access issues
  - rollout/rollback steps
  - release signoff checklist
- Include acceptance checklist for:
  - host flow
  - guest flow
  - project asset visibility
  - deterministic processing
  - operational readiness

### Acceptance criteria
- Runbook docs exist.
- Release checklist exists.
- Acceptance pack/checklist exists and matches BRD/TRD 07 intent.

---

## Task 07-06 - Removal/deprecation of conflicting legacy product surfaces

### Objective
Isolate legacy/admin/diagnostic surfaces so they do not remain part of the main product journey.

### Required behavior
- Identify legacy upload/admin/project surfaces that still appear product-facing.
- De-emphasize, isolate, document, or guard them appropriately.
- Keep diagnostic/admin tooling available where needed without confusing end users.
- Confirm multipart live path is deprecated from canonical studio flow.

### Acceptance criteria
- Canonical user journey is clean.
- Legacy/conflicting surfaces are isolated or explicitly marked as non-product.
- No product flow depends on deprecated live-upload assumptions.

---

## Task 07-07 - Program-level regression and validation matrix

### Objective
Lock program-level confidence into a reusable validation matrix, not ad hoc memory.

### Required behavior
- Provide validation coverage mapping for:
  - host flow
  - guest flow
  - upload/recovery/finalize
  - processing/combined output
  - project presentation
  - operational drills
- Link automated coverage where it exists.
- Call out manual verification still required.

### Acceptance criteria
- A program-level validation matrix exists.
- Known failure modes have an owning test or manual verification step.
- Gaps are explicit rather than hidden.

---

## Task 07-08 - Governance notes and documented definition of done

### Objective
Make the delivery model sustainable for future work.

### Required behavior
- Document:
  - source-of-truth rule
  - workstream ownership expectation
  - change approval/deviation expectation
  - definition of done for the program
- Keep future work grounded in BRD/TRD 01-07 rather than silent prompt-driven divergence.

### Acceptance criteria
- Governance note or doc exists.
- Definition of done is documented.
- Future work can trace back to the established delivery model.

---

## Cross-cutting rules
- Do not rebuild already-working BRD 01-06 implementation unnecessarily.
- Prefer minimal, focused changes over broad rewrites.
- Treat BRD/TRD 07 as a delivery and operationalization layer on top of BRD/TRD 01-06.
- Keep product-facing APIs/pages clean and user-oriented.
- Keep diagnostics, admin tools, and rollout controls separate from normal product journeys.
- Migration behavior must be additive and rollout-safe.
- Unknown historical state must remain explicit rather than guessed.
- Add or update tests/docs for every changed delivery-critical behavior.

---

## Suggested implementation checklist
For each task:
1. verify current implementation
2. classify as:
   - implemented
   - partially implemented
   - missing
3. implement only missing/partial pieces
4. add or update tests/docs/runbooks if needed
5. record concise verification notes

---

## Output format expected from the coding agent

### Compliance Matrix
| Task | Status | Evidence | Missing Work | Files |

### Implementation Plan
- task order
- files to update
- tests/docs/runbooks to add/update

### Code Changes Made
- Backend/API if affected
- Frontend if affected
- DTO/contracts if affected
- Schema/Migrations if affected
- Diagnostics/telemetry
- Docs/runbooks/checklists
- Tests
- Governance/notes if applicable

### Verification
- tests/docs/runbooks added/updated
- what passed
- remaining risks or intentional deferrals
