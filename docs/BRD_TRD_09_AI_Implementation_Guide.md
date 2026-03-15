# BRD/TRD 09 AI Implementation Guide

## Title
**BRD/TRD 09 - Observability, Telemetry, Alerting, and Production Operations**

## Source of truth
This guide is derived from:
- BRD 09
- TRD 09

Use those documents as the source of truth if any wording here needs clarification.

> Note: this BRD/TRD is an **observability, alerting, and production-operations** specification.
> It does not redefine product behavior. It defines how BRD/TRD 01-08 must be observed, alerted on, diagnosed, and operated safely in production.

---

## Goal
Complete BRD/TRD 09 correctly by:
- verifying what is already implemented
- identifying missing telemetry, metrics, dashboards, alerts, and runbooks
- implementing only the missing or partial observability/operations pieces
- avoiding unnecessary rewrites of product logic

This scope is about:
- structured telemetry
- event taxonomy
- metrics and SLAs
- dashboards
- alert rules and severities
- operator diagnostics
- runbooks
- production evidence and supportability

---

## Core business intent
The platform must make it possible for support, product, and engineering to answer:

- What is happening now?
- What failed?
- Who is affected?
- What action is required?

Every critical user-facing lifecycle state must have:
- measurable backend truth
- observable telemetry
- alerting where business impact justifies it
- a runbook-backed response path

Do not rely on anecdotal screenshots, browser-only optimism, or raw infrastructure spelunking as the primary source of truth.

---

## Observable business entities
These business entities must be observable end to end:

- **Studio session**
  - who started, who joined, current state, participant count, uploads pending
- **Participant**
  - host/guest identity, recording enabled, upload complete truth, produced assets
- **Track**
  - audio/video/screen presence, finalization state, upload completion, processing readiness
- **Recording**
  - readiness, blocked reason, minimum-ready vs fully-ready
- **Project asset group**
  - combined readiness, participant output readiness, transcript readiness, export readiness, visible failure state

---

## Telemetry principles
Use these principles from TRD 09:

1. **Structured events with stable identifiers**
   - recordingId
   - projectId
   - sessionId
   - participantId
   - trackId
   - chunkId
   - jobId
   - assetId

2. **Lifecycle truth must come from backend truth**
   - do not treat front-end timers or optimistic UI as the business signal

3. **Logs, metrics, traces/events, and dashboards serve different jobs**
   - logs -> diagnosis
   - metrics -> detection
   - event history -> reconstruction
   - dashboards -> operations

4. **Both active-session and post-stop flows must be observable**
   - live recording
   - upload/finalize
   - processing
   - project readiness

5. **Every alert must map to an owner and a runbook**

---

## Canonical telemetry dimensions
Use these dimensions where applicable:

- **Identity**
  - recordingId, projectId, sessionId, participantId, trackId, chunkId, jobId, assetId
- **Role and mode**
  - host/guest, studio mode, session type, track kind, asset kind, combined vs participant-scoped
- **Transport**
  - protocol, initiate status, resume path, retry count, offset progress, completion status
- **Lifecycle**
  - recording state, track state, chunk state, finalize state, processing stage, project readiness stage
- **Failure context**
  - error code, failure class, retryable flag, dependency, endpoint, worker class, duration bucket

---

## Required event taxonomy
At minimum, verify or implement these event families.

### Session / join
- invite_opened
- prejoin_started
- prejoin_failed
- session_join_requested
- session_joined
- session_left
- session_stop_requested
- session_stopped

### Track lifecycle
- track_registered
- track_recovered
- track_finalize_requested
- track_finalized
- track_blocked
- track_ready_for_stitch

### Chunk lifecycle
- chunk_initiate_requested
- chunk_initiate_existing
- chunk_initiate_seq_mismatch
- chunk_upload_started
- chunk_upload_resumed
- chunk_upload_progress
- chunk_completed
- chunk_materialized
- chunk_failed

### Pipeline
- stitch_queued
- stitch_started
- stitch_completed
- transcode_queued
- transcode_completed
- compose_combined_started
- compose_combined_completed
- transcript_started
- export_completed

### Project readiness
- project_minimum_ready
- project_fully_ready
- asset_missing
- asset_ready
- project_blocked

### Incident signals
- queue_backlog_high
- worker_failure_rate_high
- active_upload_stall
- finalize_timeout
- project_readiness_sla_breached

---

## Minimum metrics set
At minimum, verify or add metrics for:

- active sessions count
- active participants count
- active finalized tracks pending processing
- chunk initiate rate
- chunk complete rate
- chunk failure rate
- seq mismatch rate
- TUS resume success rate
- upload retry rate
- per-participant upload completion latency
- per-recording upload completion latency
- finalize latency
- stop-to-all-tracks-finalized
- upload-complete-but-not-finalized count
- worker queue depth by job type
- worker success/failure/retry counts
- stop-to-minimum-ready
- stop-to-fully-ready
- combined-output readiness latency
- participant-output readiness latency
- guest join success rate
- prejoin abandonment rate
- guest upload completion rate vs host upload completion rate

---

## Required dashboards
At minimum, define or implement these dashboards:

1. **Executive health**
   - reliability
   - readiness SLAs
   - incident count
   - affected recordings
   - backlog trend

2. **Live operations**
   - active sessions
   - uploads in flight
   - stalled uploads
   - finalize waits
   - processing queue depth
   - blocked projects

3. **Recording drill-down**
   - one recording timeline
   - participant uploads
   - track states
   - finalization
   - jobs
   - assets
   - failure reasons

4. **Worker operations**
   - throughput
   - failure reasons
   - retry counts
   - saturation
   - backlog aging

5. **Guest experience**
   - invite-open to join funnel
   - device-check issues
   - guest upload progress
   - guest-specific failures

---

## Required alert classes and severity mapping
At minimum, define or implement alerting for:

### User-facing failure
Alert quickly when active recordings cannot progress because of:
- upload failures
- finalize failures
- processing failures above threshold

### Silent degradation
Alert when the system still accepts sessions but shows:
- abnormal delay
- abnormal retry volume
- missing downstream processing

### Backlog risk
Alert when:
- worker queues exceed threshold
- pending projects exceed threshold
- saturation risk is building

### Data integrity risk
Alert when:
- combined output is marked ready with inconsistent upstream state
- participant outputs are missing/inconsistent relative to readiness

### Severity mapping
Use at least:
- **Sev 1** widespread inability for active recordings to upload/finalize or broad combined-output blockage
- **Sev 2** sustained high failure rate causing meaningful user impact
- **Sev 3** backlog or SLA breach risk / degraded but partially functioning paths
- **Sev 4** isolated recording/asset/support-visible inconsistency

Alert implementation rules:
- include identifiers needed for drill-down
- include user impact statement
- include runbook link
- use persistence/rate windows to avoid flapping
- distinguish temporary burst from true saturation

---

## Runbook set
At minimum, create or verify these runbooks:

- upload stall for host or guest
- finalize requested but final_seq incomplete or track not stitch-ready
- stitch queue stuck or stitch failures rising
- combined output missing while participant outputs exist
- project upload complete but not minimum-ready within SLA
- guest can join but cannot upload or participant-scoped assets missing
- database or storage schema mismatch during rollout/migration

Each runbook must include:
- symptom
- likely causes
- immediate checks
- safe remediation
- prohibited actions if applicable
- escalation trigger and owner

---

## Derived implementation task order
Implement in this order unless a dependency clearly requires a small adjustment:

1. **09-01 - Telemetry taxonomy and lifecycle-event coverage audit**
2. **09-02 - Metrics, SLA signals, and observable truth coverage**
3. **09-03 - Dashboard specification and recording drill-down model**
4. **09-04 - Alert rules, severity mapping, and ownership links**
5. **09-05 - Operator diagnostics and supportability surface**
6. **09-06 - Runbook pack for recording, upload, processing, and guest incidents**
7. **09-07 - Production-readiness evidence and operational acceptance pack**
8. **09-08 - Observability definition of done and maintenance rules**

---

## Task 09-01 - Telemetry taxonomy and lifecycle-event coverage audit

### Objective
Audit and complete the canonical telemetry event model across join, recording, upload, finalize, processing, and project readiness.

### Required behavior
- Verify or add structured events for the required event taxonomy.
- Ensure stable identifiers and lifecycle dimensions are attached where applicable.
- Separate host and guest join failures in telemetry.
- Ensure project minimum-ready and fully-ready events are distinguishable.

### Acceptance criteria
- Event taxonomy coverage exists for major lifecycle transitions.
- Host/guest/join/upload/processing/project events are distinguishable.
- Missing event coverage is explicit and either implemented or documented.

---

## Task 09-02 - Metrics, SLA signals, and observable truth coverage

### Objective
Ensure critical user-facing states have metric-backed detection and SLA visibility.

### Required behavior
- Verify or add metrics for upload, finalize, queue, readiness, and guest-flow health.
- Add or document SLA metrics for:
  - stop-to-minimum-ready
  - stop-to-fully-ready
  - upload completion latency
- Ensure metrics reflect backend truth rather than optimistic UI state.

### Acceptance criteria
- Minimum metrics set is implemented or explicitly mapped.
- SLA metrics are documented and attributable.
- Critical user-visible states have at least one metric-backed detection path.

---

## Task 09-03 - Dashboard specification and recording drill-down model

### Objective
Provide operator-facing dashboard definitions or notes that support both fleet-level health and one-recording investigation.

### Required behavior
- Define or update dashboard specs for:
  - executive health
  - live operations
  - recording drill-down
  - worker operations
  - guest experience
- Ensure one-recording drill-down can explain:
  - participant uploads
  - track states
  - finalization
  - jobs
  - asset readiness
  - blocked reasons

### Acceptance criteria
- Dashboard set is documented or implemented.
- Recording drill-down requirements are explicit.
- Operators can move from fleet symptom to one-recording diagnosis.

---

## Task 09-04 - Alert rules, severity mapping, and ownership links

### Objective
Turn high-impact operational failures into actionable alerts with owners and runbook links.

### Required behavior
- Define or update alert rules for user-facing failure, silent degradation, backlog risk, and data integrity risk.
- Map each alert to severity, owner, and runbook.
- Include user-impact language and anti-flap guidance.

### Acceptance criteria
- Required alert classes are documented or implemented.
- Severity and owner mapping is explicit.
- Each alert has a runbook/reference path.

---

## Task 09-05 - Operator diagnostics and supportability surface

### Objective
Provide operator/support-facing diagnostics that explain why a recording or project is stuck without leaking internals into product UIs.

### Required behavior
- Verify or add operator diagnostics for:
  - upload/recovery truth
  - lifecycle/blocked reasons
  - processing readiness/failures
  - guest auth/denial issues
- Ensure support can answer why a project is not ready using system data.

### Acceptance criteria
- There is a support/operator-friendly path to diagnose one recording/project.
- Product-facing APIs remain clean.
- Diagnostics are grounded in backend truth.

---

## Task 09-06 - Runbook pack for recording, upload, processing, and guest incidents

### Objective
Provide actionable runbooks for critical incidents and recurring support cases.

### Required behavior
- Create or update the required runbook set.
- Keep runbooks architecture-accurate and specific to current flows.
- Include escalation and prohibited-action guidance.

### Acceptance criteria
- Required runbooks exist.
- Support/on-call can distinguish waiting state from broken state.
- Runbooks are linked from alerts/diagnostics where appropriate.

---

## Task 09-07 - Production-readiness evidence and operational acceptance pack

### Objective
Create the production-readiness evidence package for observability and operations.

### Required behavior
- Add or update an evidence pack showing:
  - telemetry coverage
  - dashboards
  - alerts
  - runbooks
  - support tooling
  - verification steps
- Include go/no-go operational evidence expectations.

### Acceptance criteria
- Operational evidence pack exists.
- Production-readiness expectations are explicit.
- Missing platform-side setup is clearly called out rather than implied complete.

---

## Task 09-08 - Observability definition of done and maintenance rules

### Objective
Make the observability system sustainable as architecture evolves.

### Required behavior
- Document:
  - observability definition of done
  - obligation to update telemetry/runbooks/alerts when lifecycle changes
  - requirement that every critical state remain observable
  - separation between product payloads and operator detail

### Acceptance criteria
- Observability DoD note exists.
- Maintenance/update rule is explicit.
- Future changes can stay aligned with BRD/TRD 09 without drift.

---

## Cross-cutting rules
- Do not rebuild already-working BRD 01-08 product logic unnecessarily.
- Treat BRD/TRD 09 as the observability/operations layer over BRD/TRD 01-08.
- Keep product-facing APIs/UI clean; keep operator detail in diagnostics, telemetry, dashboards, alerts, and runbooks.
- Prefer additive telemetry/docs/runbooks/alert mappings over redesign.
- Every critical user-visible state must have:
  - persisted/backend truth
  - observable signal
  - diagnosable path
- If a state cannot be observed, it cannot be trusted operationally.

---

## Suggested implementation checklist
For each task:
1. verify current implementation
2. classify as:
   - implemented
   - partially implemented
   - missing
3. implement only missing/partial pieces
4. add/update telemetry/docs/runbooks/checklists/tests if needed
5. record concise verification notes

---

## Output format expected from the coding agent

### Compliance Matrix
| Task | Status | Evidence | Missing Work | Files |

### Implementation Plan
- task order
- files to update
- telemetry/docs/runbooks/checklists/tests to add/update

### Code Changes Made
- Backend/telemetry if affected
- Diagnostics/support surfaces if affected
- Docs/runbooks/alerts/dashboards notes
- Tests/verification notes
- Governance/ops notes if applicable

### Verification
- tests/docs/runbooks/checklists added/updated
- what passed
- remaining risks or intentional deferrals
