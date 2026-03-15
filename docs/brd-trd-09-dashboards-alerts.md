# BRD/TRD 09 Dashboards and Alert Specification

This document defines the dashboard set, alert rules, severity mapping, and ownership links for BRD/TRD 09.

## Dashboard Set

### 1. Executive health

Purpose:
- overall service health
- readiness SLA trend
- incident volume
- affected recordings

Minimum panels:
- recordings reaching `project.fully_ready`
- recordings breaching stop-to-minimum-ready SLA
- open Sev 1 and Sev 2 counts
- worker backlog trend by job type
- upload failure rate trend

Primary data sources:
- telemetry events
- lifecycle diagnostics truth
- job queue counts

### 2. Live operations

Purpose:
- active session and upload monitoring

Minimum panels:
- active sessions
- active participants
- recordings still in `uploading`
- finalized tracks not yet `ready_for_stitch`
- stalled uploads
- upload failure rate

Primary data sources:
- websocket/session telemetry
- lifecycle diagnostics
- progress route truth

### 3. Recording drill-down

Purpose:
- one-recording diagnosis without database archaeology

Required sections:
- recording timeline
- participant completion
- track contiguity and finalization
- stitch/transcode/combined/export status
- blocked reasons
- guest auth denials if relevant

Primary data sources:
- [recording-support-snapshot.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/tools/recording-support-snapshot.ts)
- `/v1/recordings/:id/lifecycle-diagnostics`
- `/v1/recordings/:id/progress`
- `/v1/recordings/:id/project-assets`

### 4. Worker operations

Purpose:
- throughput, saturation, and failure visibility

Minimum panels:
- queue depth by job type
- backlog age by job type
- worker success/failure counts
- retry volume
- worker-loop errors

Primary data sources:
- job table
- worker telemetry events

### 5. Guest experience

Purpose:
- invite-to-join funnel and guest upload health

Minimum panels:
- guest bootstrap accepted/rejected
- guest claim accepted/rejected
- guest join requested vs joined
- guest access blocked
- guest upload completion

Primary data sources:
- guest telemetry families
- upload completion telemetry

## Alert Rules

| Alert ID | Trigger | Severity | Owner | Runbook | Anti-Flap Guidance |
| --- | --- | --- | --- | --- | --- |
| `ALERT-ACTIVE-UPLOAD-STALL` | active recording remains in `uploading` beyond normal post-stop window | Sev 1 or Sev 2 depending on breadth | ingest/on-call | `RB-01` | require persistence window and affected-recording threshold |
| `ALERT-FINALIZE-TIMEOUT` | finalized track still missing contiguous uploads or never reaches stitch-ready | Sev 2 | ingest/on-call | `RB-02` | alert only after repeated checks across the same recording |
| `ALERT-STITCH-BACKLOG-HIGH` | stitch queue depth or age exceeds threshold | Sev 3 | processing/on-call | `RB-03` | use age plus backlog, not raw count only |
| `ALERT-COMBINED-OUTPUT-MISSING` | participant outputs exist but combined asset remains missing or failed | Sev 2 | processing/on-call | `RB-04` | suppress until participant masters are actually ready |
| `ALERT-PROJECT-MINIMUM-READY-SLA` | stopped recording misses stop-to-minimum-ready SLA | Sev 2 or Sev 3 depending on breadth | processing/on-call | `RB-05` | use per-environment SLA windows and sample size floor |
| `ALERT-GUEST-UPLOAD-FORBIDDEN` | guest can join but upload/participant-scoped actions are denied unexpectedly | Sev 2 | auth/on-call | `RB-06` | rate-based, not single isolated incident |
| `ALERT-ROLLBACK-SCHEMA-MISMATCH` | migration rollout leaves DB/storage/app versions inconsistent | Sev 2 | release owner | `RB-07` | trigger only on confirmed deployment mismatch |
| `ALERT-WORKER-FAILURE-RATE-HIGH` | worker job failures exceed threshold by job type | Sev 2 | processing/on-call | `RB-03`, `RB-04`, `RB-05` | require sustained failure rate over window |
| `ALERT-PROJECT-DATA-INTEGRITY` | project is marked minimum-ready or ready with inconsistent upstream truth | Sev 2 | platform/on-call | `RB-05` | confirm against diagnostics before paging |

## Alert Payload Requirements

Every alert should include:

- alert ID
- severity
- user impact statement
- affected recording IDs or sample IDs
- key identifiers for drill-down
- likely subsystem
- runbook reference

## Severity Mapping

Use the BRD 08 severity policy from [brd-trd-08-severity-and-governance.md](/Users/rakeshkumar/dev/projects/studio-cast/docs/brd-trd-08-severity-and-governance.md), with these BRD 09 interpretations:

- Sev 1: active recordings broadly cannot upload/finalize or active sessions are broadly broken
- Sev 2: meaningful user-facing failure rate or blocked projects above tolerated threshold
- Sev 3: backlog/SLA degradation building risk but partial functionality remains
- Sev 4: isolated recording inconsistency or support-visible issue with low blast radius

## Ownership Map

- ingest/on-call: chunk upload, finalize, recovery stalls
- processing/on-call: stitch, transcode, combined, readiness SLAs
- auth/on-call: guest bootstrap, claim, upload-scope denial
- release owner: rollout mismatch, migration/storage contract issues
- platform/on-call: cross-cutting data integrity or observability gaps

## Recording Drill-Down Path

When a fleet-level alert fires, operators should move in this order:

1. fleet dashboard symptom
2. sample affected recording ID
3. `npm run support:recording`
4. lifecycle diagnostics
5. runbook-linked remediation
