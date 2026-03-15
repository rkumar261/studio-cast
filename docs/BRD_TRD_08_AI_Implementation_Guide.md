# BRD/TRD 08 AI Implementation Guide

## Title
**BRD/TRD 08 - QA Strategy, Acceptance Criteria, Test Matrix, and Operational Runbooks**

## Source of truth
This guide is derived from:
- BRD 08
- TRD 08

Use those documents as the source of truth if any wording here needs clarification.

> Note: this BRD/TRD is a **quality, acceptance, and operations** specification.
> It is not a product-feature spec. It defines how BRD/TRD 01-07 must be validated, evidenced, operated, and released safely.

---

## Goal
Complete BRD/TRD 08 correctly by:
- verifying what is already implemented
- identifying missing quality, acceptance, runbook, and operational evidence
- implementing only the missing or partial QA/ops pieces
- avoiding unnecessary rewrites of product logic

This scope is about:
- quality gates
- acceptance evidence
- automated regression layers
- manual test matrix
- release gates
- operational runbooks
- observability requirements
- severity/triage policy alignment
- definition of done for the QA system

---

## Core business intent
A feature is **not delivered** when code paths merely exist.
It is delivered only when the target journey is covered by:
- agreed acceptance criteria
- automated regression where appropriate
- manual validation where necessary
- clear runbooks and operational recovery actions
- release evidence that supports go / no-go decisions

This BRD/TRD turns release confidence into a structured system instead of demo-based approval or prompt-driven improvisation.

---

## In-scope validation journeys
The QA system must cover these journeys:

### Host journey
- authenticated entry
- pre-recording interface
- recording
- stop
- upload completion
- project handoff
- project asset visibility

### Guest journey
- invite URL entry
- no-login participation
- prejoin/device check
- required name / optional email
- session join
- upload completion
- guest project visibility boundaries

### Upload/recovery journey
- initiate
- complete
- duplicate/idempotent retry
- reconnect/recovery
- finalize
- late completion
- post-stop correctness

### Processing/project journey
- readiness gates
- combined output generation
- participant asset visibility
- pending/failed processing communication
- truthful ready/not-ready states

### Operational journey
- stuck uploads
- recovery failures
- finalization mismatches
- worker backlog/failures
- project readiness inconsistency
- support/on-call diagnosis and escalation

---

## Required evidence model
No single artifact is enough.

Release confidence must combine:
1. **Experience evidence**
   - demo run
   - screenshots
   - scenario checklist
2. **Functional evidence**
   - automated tests
   - route/service/worker validation
   - persisted state checks
3. **Reliability evidence**
   - refresh/reconnect/retry drills
   - guest upload completion correctness
   - interruption/resume behavior
4. **Operational evidence**
   - runbooks
   - dashboards
   - logs
   - alerts
   - simulation drills

---

## Release gates
Use these as the default release gates.

### Gate 1 - Build health
Minimum:
- services build
- migrations apply
- critical workers start

### Gate 2 - Functional baseline
Minimum:
- happy-path host recording passes
- happy-path guest recording passes
- upload completion passes
- project asset visibility passes

### Gate 3 - Resilience
Minimum:
- refresh/reconnect/retry matrix passes
- stop/finalize/delayed processing scenarios pass

### Gate 4 - Operational readiness
Minimum:
- runbooks exist
- alerts exist
- dashboards exist
- support playbooks reviewed

### Gate 5 - Release verification
Minimum:
- pre-prod or production smoke checks pass after deployment

A release should not be treated as complete unless its required gate evidence exists.

---

## Quality architecture from TRD 08

### Test layers
1. **Unit / service**
   - business rules
   - lifecycle transitions
   - state calculations

2. **Route / integration**
   - API contracts
   - auth
   - DB writes
   - idempotency
   - queue publication

3. **Worker / orchestration**
   - readiness
   - job generation
   - failure handling
   - asset state transitions

4. **End-to-end**
   - real user flows across UI, API, upload, finalize, processing, and project presentation

5. **Operational drills**
   - runbook exercises
   - synthetic checks
   - incident simulations

### Traceability rule
Every important test or runbook item should map back to the BRD/TRD scope.

Use a traceability key format such as:
- `UPLOAD-RECOVERY-003`
- `PROJECT-ASSET-006`
- `RB-03`

---

## Derived implementation task order
Implement in this order unless a dependency clearly requires a small adjustment:

1. **08-01 - Acceptance matrix and traceability model**
2. **08-02 - Automated regression coverage audit and gap closure**
3. **08-03 - End-to-end/manual test matrix and scenario pack**
4. **08-04 - Release gates and evidence package**
5. **08-05 - Observability requirements, dashboards, and alert mapping**
6. **08-06 - Operational runbook pack**
7. **08-07 - Severity, triage, and release-blocking policy codification**
8. **08-08 - QA definition-of-done and maintenance rules**

---

## Task 08-01 - Acceptance matrix and traceability model

### Objective
Create one traceable acceptance matrix that ties BRD/TRD 01-08 scope to tests, checklists, and release evidence.

### Required behavior
- Define or update a matrix that maps:
  - business scenarios
  - technical contracts
  - runbook IDs
  - test suites
  - release checklist items
- Cover:
  - host flow
  - guest flow
  - upload/recovery/finalize
  - processing/readiness
  - project presentation
  - operational response
- Use stable IDs for scenarios and incidents.

### Acceptance criteria
- A traceable acceptance matrix exists.
- Every major BRD/TRD journey maps to at least one verification mechanism.
- Gaps are explicit instead of implicit.

---

## Task 08-02 - Automated regression coverage audit and gap closure

### Objective
Make sure mandatory recurring failure modes are covered by automated tests.

### Required behavior
Audit and add/update coverage for at least these mandatory areas:
- chunk initiate
- chunk complete
- duplicate/idempotent retry
- recovery
- queue ordering
- finalize
- readiness gating
- late completion after stop
- combined asset gating
- authorization boundaries
- project presentation contract

Preferred layers:
- service/unit
- route/integration
- worker/orchestration
- selected end-to-end where high value

### Acceptance criteria
- Mandatory automated coverage exists for high-risk regressions.
- Existing gaps are documented or closed.
- Route/service/worker expectations align with BRD/TRD contracts.

---

## Task 08-03 - End-to-end/manual test matrix and scenario pack

### Objective
Define the non-automated validation needed for browser, media, role, and network realism.

### Required behavior
Create or update a manual/E2E matrix covering:
- host only
- host + one guest
- host + multiple guests
- delayed guest upload
- stable network
- intermittent network
- offline/reconnect
- slow upload
- audio+video
- audio-only where allowed
- screen share where supported
- refresh during upload
- guest leaves early
- host leaves after finalize

Where browser automation exists, map it to the same scenario IDs.

### Acceptance criteria
- Manual/E2E scenario pack exists.
- Required variants are explicitly listed.
- It is clear which scenarios are automated, manual, or both.

---

## Task 08-04 - Release gates and evidence package

### Objective
Turn release readiness into a repeatable evidence package, not a conversation.

### Required behavior
Create or update the evidence package so each release candidate has:
- automated test report
- manual exploratory / scenario report
- migration + environment note
- operational readiness signoff
- release smoke result
- go / no-go signoff note

Map these to Gates 1-5.

### Acceptance criteria
- Release gate checklist exists.
- Evidence package format exists.
- Each gate has clear minimum conditions and expected artifacts.

---

## Task 08-05 - Observability requirements, dashboards, and alert mapping

### Objective
Ensure operators can detect and diagnose common failures without database archaeology.

### Required behavior
Verify or add coverage for:
- request logs with recording/participant/track/chunk context
- queue metrics
- worker metrics
- state metrics
- alert definitions

Map observability to runbooks and incident IDs where possible.

Expected alerts include:
- upload stuck
- recovery failure spike
- finalize mismatch
- stitch/transcode failure spike
- project readiness timeout

### Acceptance criteria
- Observability requirements are documented and mapped.
- Required alert classes are identified.
- Operators can correlate incidents to logs/metrics/runbooks.

---

## Task 08-06 - Operational runbook pack

### Objective
Provide support/on-call runbooks that another engineer can execute without tribal knowledge.

### Required behavior
Create or update runbooks for at least:
- `RB-01` Upload stuck before completion
- `RB-02` Upload complete but project not ready
- `RB-03` Combined asset missing
- `RB-04` Guest cannot upload / forbidden action
- `RB-05` Project page incorrect asset status

Each runbook must include:
- symptom
- likely causes
- immediate checks
- safe remediation
- prohibited actions if applicable
- escalation trigger and owner

### Acceptance criteria
- Runbook pack exists.
- Runbooks match the current architecture.
- Support/on-call can distinguish wait state vs broken state.

---

## Task 08-07 - Severity, triage, and release-blocking policy codification

### Objective
Make release blocking and incident handling consistent.

### Required behavior
Document and align:
- Sev 1
- Sev 2
- Sev 3
- Sev 4
- release-blocking rule for in-scope scenarios
- explicit handling for accepted risk

At minimum:
- open Sev 1 or Sev 2 in-scope issues block release unless explicitly accepted in writing

### Acceptance criteria
- Severity matrix exists in docs/checklists.
- Release blocking rule is explicit.
- Triage expectations are consistent with QA signoff.

---

## Task 08-08 - QA definition-of-done and maintenance rules

### Objective
Make the QA system sustainable as architecture evolves.

### Required behavior
Document:
- entry criteria
- exit criteria
- definition of done for QA system
- obligation to update tests/runbooks when architecture changes
- expectation that states must be verifiable to be trusted

### Acceptance criteria
- QA definition-of-done doc/note exists.
- Entry and exit criteria are explicit.
- Future changes can be kept aligned with BRD/TRD 08 instead of drifting.

---

## Canonical scenario groups to keep in sync
Use these scenario groups across tests and runbooks:

- `HOST-CORE-*`
- `GUEST-CORE-*`
- `UPLOAD-RECOVERY-*`
- `FINALIZE-PROCESS-*`
- `PROJECT-ASSET-*`
- `AUTHZ-*`
- `RB-*`

---

## Cross-cutting rules
- Do not rebuild already-working BRD 01-07 product logic unnecessarily.
- Treat BRD/TRD 08 as the quality and operations layer over BRD/TRD 01-07.
- Keep product-facing APIs and UI clean; do not dump operator detail into them.
- Prefer additive docs/tests/runbooks/dashboards over redesign.
- Manual validation is required where browser/media/network behavior cannot be trusted from code alone.
- Every critical user-visible state must map to:
  - persisted truth
  - observable signal
  - at least one verification mechanism
- If a state cannot be verified, it cannot be trusted.

---

## Suggested implementation checklist
For each task:
1. verify current implementation
2. classify as:
   - implemented
   - partially implemented
   - missing
3. implement only missing/partial pieces
4. add/update tests/docs/runbooks/checklists as needed
5. record concise verification notes

---

## Output format expected from the coding agent

### Compliance Matrix
| Task | Status | Evidence | Missing Work | Files |

### Implementation Plan
- task order
- files to update
- tests/docs/runbooks/checklists to add/update

### Code Changes Made
- Backend/tests if affected
- Frontend/E2E if affected
- Docs/checklists/runbooks
- Observability/alerts/dashboards notes
- Governance/QA notes if applicable

### Verification
- tests/docs/runbooks/checklists added/updated
- what passed
- remaining risks or intentional deferrals
