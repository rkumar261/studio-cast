# BRD/TRD 08 Observability and Runbook Pack

This document defines the operator-facing observability requirements, alert mapping, and runbooks for BRD/TRD 08.

## Observability Requirements

### Required context on logs and diagnostics

Every incident investigation should be able to correlate by:

- `recordingId`
- `participantId`
- `trackId`
- `chunkId`
- `assetId`
- `jobId`

Source of truth:

- structured events in [backend/src/lib/telemetry.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/lib/telemetry.ts)
- owner-only lifecycle diagnostics route
- support snapshot tool

### Required signals by failure class

| Incident ID | Signal Type | Required Signal | Primary Source |
| --- | --- | --- | --- |
| `INC-UPLOAD-STUCK` | logs + state | `upload.chunk.failed`, `upload.recovery.snapshot`, progress stuck in `uploading` | telemetry + `/progress` + support snapshot |
| `INC-RECOVERY-SPIKE` | logs + rate | repeated recovery snapshots or chunk failures across recordings | telemetry aggregation |
| `INC-FINALIZE-MISMATCH` | state + logs | finalized track missing contiguous uploaded chunks through `finalSeq` | lifecycle diagnostics + pipeline tests |
| `INC-STITCH-TRANSCODE-FAIL` | logs + state | `stitch.failed`, `asset.participant.failed`, `asset.combined.failed` | telemetry + support snapshot |
| `INC-PROJECT-READY-TIMEOUT` | state + summary | project not `minimumReady` within expected operational window | project-assets summary + support snapshot |
| `INC-GUEST-AUTHZ` | logs + route denial | `guest.bootstrap.rejected`, `guest.claim.rejected`, `guest.access.blocked` | telemetry + route responses |

## Dashboard and Alert Map

BRD/TRD 08 does not add a runtime dashboard service. It defines the minimum panels and alerts the operator dashboard must expose.

### Minimum dashboard panels

1. Upload health
   - count of `upload.chunk.failed`
   - count of `upload.participant.completed`
   - active recordings whose `/progress` remains `uploading`
2. Processing health
   - count of `stitch.failed`
   - count of `asset.participant.failed`
   - count of `asset.combined.failed`
   - projects not `minimumReady`
3. Guest access health
   - count of `guest.bootstrap.rejected`
   - count of `guest.claim.rejected`
   - count of `guest.access.blocked`
4. Export/transcript health
   - count of `transcript.failed`
   - count of `export.failed`

### Minimum alert classes

| Alert ID | Trigger | Severity Default | Runbook |
| --- | --- | --- | --- |
| `ALERT-UPLOAD-STUCK` | recording remains in `uploading` beyond normal post-stop window | Sev 2 | `RB-01` |
| `ALERT-RECOVERY-FAILURE-SPIKE` | chunk failures or recovery anomalies spike over baseline | Sev 2 | `RB-01` |
| `ALERT-FINALIZE-MISMATCH` | finalized track shows missing contiguous uploads | Sev 2 | `RB-02` |
| `ALERT-STITCH-TRANSCODE-FAILURE-SPIKE` | stitch or asset failures spike | Sev 2 | `RB-02`, `RB-03` |
| `ALERT-PROJECT-READINESS-TIMEOUT` | project remains not minimum-ready beyond expected processing window | Sev 2 | `RB-02`, `RB-05` |
| `ALERT-GUEST-FORBIDDEN-SPIKE` | guest access rejections spike unexpectedly | Sev 3 | `RB-04` |

## Support Tooling

### Recording support snapshot

```bash
cd backend
API_BASE=http://localhost:8080 \
AUTH_COOKIE='access_token=<cookie>' \
RECORDING_ID='<recording-id>' \
npm run support:recording
```

Use it before escalating to direct database inspection.

### Acceptance runner

```bash
cd backend
API_BASE=http://localhost:8080 \
AUTH_COOKIE='access_token=<cookie>' \
RECORDING_ID='<recording-id>' \
npm run acceptance:recording
```

Use it to validate final-ready convergence on a real recording.

## Runbooks

### `RB-01` Upload stuck before completion

- Symptom: recording or studio remains in `uploading`; participant completion does not converge.
- Likely causes:
  - missing chunk completion
  - recovery drift after reconnect
  - chunk state failed or stale
- Immediate checks:
  - run `npm run support:recording`
  - inspect `/progress`
  - inspect lifecycle diagnostics blocked tracks
  - inspect `upload.chunk.failed` and `upload.recovery.snapshot`
- Safe remediation:
  - run maintenance worker once
  - retry the affected client upload/recovery path
  - confirm `nextExpectedSeq` converges
- Prohibited actions:
  - do not mark upload complete manually in the database
  - do not force project `ready`
- Escalation:
  - escalate to backend owner if support snapshot still shows blocked tracks after maintenance and retry

### `RB-02` Upload complete but project not ready

- Symptom: upload is complete, but project remains `processing` or `action required`.
- Likely causes:
  - missing participant master asset
  - stitch/transcode failure
  - blocked lifecycle state after finalize mismatch
- Immediate checks:
  - confirm workers are running in dependency order
  - run `npm run support:recording`
  - inspect `pendingWork`, `failedWork`, and blocked tracks
- Safe remediation:
  - restart the affected worker
  - retry the failed pipeline stage through the normal job path
  - keep project state honest; do not fake ready
- Prohibited actions:
  - do not write storage keys or asset rows manually
  - do not collapse `minimumReady` and `fullyProcessed`
- Escalation:
  - escalate to processing owner if combined or participant asset remains blocked after worker restart

### `RB-03` Combined asset missing

- Symptom: participant assets may exist, but combined output is absent or failed.
- Likely causes:
  - participant masters not all ready
  - combined composition job failed
  - deterministic input set changed after failure
- Immediate checks:
  - inspect support snapshot combined asset state
  - inspect `asset.combined.failed`
  - confirm participant assets and readiness preconditions
- Safe remediation:
  - retry combined generation through the existing combined job path
  - confirm participant inputs are stable and ready
- Prohibited actions:
  - do not publish a fake combined asset URL
  - do not point the combined card at an arbitrary participant asset
- Escalation:
  - escalate to processing owner when repeated combined retries fail on the same input set

### `RB-04` Guest cannot upload or receives forbidden action

- Symptom: guest join fails, upload is forbidden, or guest reaches a blocked owner route.
- Likely causes:
  - invite expired/revoked
  - guest token scope mismatch
  - guest attempted owner/project/admin path
- Immediate checks:
  - inspect `guest.bootstrap.rejected`, `guest.claim.rejected`, `guest.access.blocked`
  - confirm invite token and participant binding
  - confirm route is owner-only by design
- Safe remediation:
  - reissue the guest invite if the token is no longer valid
  - have the guest rejoin through the invite-bound studio route
- Prohibited actions:
  - do not grant owner credentials to a guest
  - do not reuse another participant’s token
- Escalation:
  - escalate to auth owner if invite-bound guest actions fail for a valid invite and correct participant scope

### `RB-05` Project page incorrect asset status

- Symptom: project page status appears inconsistent with actual processing truth.
- Likely causes:
  - stale polling window
  - asset read-model bug
  - lifecycle mismatch between diagnostics and project-assets summary
- Immediate checks:
  - refresh project page
  - run `npm run support:recording`
  - compare `/project-assets`, `/progress`, and `/lifecycle-diagnostics`
- Safe remediation:
  - fix the read-model or polling path
  - keep user-facing state derived from explicit assets and persisted truth
- Prohibited actions:
  - do not expose raw track/chunk internals to explain the issue in product UI
- Escalation:
  - escalate to project/read-model owner if route payload and persisted truth remain inconsistent
