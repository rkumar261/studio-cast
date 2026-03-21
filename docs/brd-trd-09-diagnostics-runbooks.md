# BRD/TRD 09 Diagnostics and Runbook Pack

This document is the BRD/TRD 09 operator drill-down and incident runbook pack.

## Operator Diagnostics Surface

The current in-repo diagnostics surface is:

1. [recording-support-snapshot.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/tools/recording-support-snapshot.ts)
2. `/v1/recordings/:id/lifecycle-diagnostics`
3. `/v1/recordings/:id/progress`
4. `/v1/recordings/:id/project-assets`
5. structured telemetry from [telemetry.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/lib/telemetry.ts)

Use them in this order for one-recording investigation:

1. run the support snapshot
2. confirm the recording timeline and SLA block
3. inspect blocked tracks and missing sequences
4. inspect project pending/failed work
5. inspect telemetry for the same `recordingId`

## Runbooks

### `RB-01` Upload stall for host or guest

- Symptom: active or post-stop upload remains stuck in `uploading`
- Likely causes:
  - missing chunk completion
  - stale resumable upload
  - repeated chunk failure
- Immediate checks:
  - run `npm run support:recording`
  - inspect lifecycle diagnostics for blocked tracks and missing seqs
  - inspect `upload.recovery.snapshot` and `upload.chunk.failed`
- Safe remediation:
  - retry client recovery path
  - run maintenance worker once if stale states need cleanup
- Prohibited actions:
  - do not force upload-complete in DB
- Escalation:
  - ingest/on-call if stall persists after recovery and maintenance

### `RB-02` Finalize requested but `finalSeq` incomplete or track not stitch-ready

- Symptom: finalize happened, but track never becomes stitch-ready
- Likely causes:
  - missing contiguous uploads through `finalSeq`
  - finalize/client sequence mismatch
  - stale chunk state
- Immediate checks:
  - inspect track diagnostics for `finalSeq`, `highestContiguousUploadedSeq`, and `missingSeqs`
  - inspect `track.finalized` and `track.ready_for_stitch`
- Safe remediation:
  - recover missing chunk uploads
  - re-run normal finalize flow only if the client truly has more media to send
- Prohibited actions:
  - do not lower `finalSeq`
  - do not set stitched/raw storage keys manually
- Escalation:
  - ingest/on-call if contiguous uploads are present but stitch-ready still never appears

### `RB-03` Stitch queue stuck or stitch failures rising

- Symptom: finalized tracks accumulate, queue depth grows, or stitch failures spike
- Likely causes:
  - worker stopped
  - queue backlog saturation
  - corrupt or missing chunk materialization
- Immediate checks:
  - inspect worker telemetry
  - inspect queue depth and backlog age
  - inspect `stitch.job.queued`, `stitch.started`, and `stitch.failed`
- Safe remediation:
  - restart stitch worker
  - allow backlog to drain before escalating scope
- Prohibited actions:
  - do not mark tracks stitched manually
- Escalation:
  - processing/on-call when worker restart does not reduce backlog or failures remain high

### `RB-04` Combined output missing while participant outputs exist

- Symptom: participant outputs are ready but combined output is pending or failed
- Likely causes:
  - combined composition failure
  - participant readiness inconsistency
  - worker issue
- Immediate checks:
  - inspect support snapshot combined asset state
  - inspect `asset.combined.processing`, `asset.combined.ready`, `asset.combined.failed`, `asset.combined.blocked`
  - confirm participant asset readiness in project assets
- Safe remediation:
  - retry the normal combined path after confirming participant inputs are ready
- Prohibited actions:
  - do not point the combined card at a participant asset as a workaround
- Escalation:
  - processing/on-call when the same input set repeatedly fails

### `RB-05` Project upload complete but not minimum-ready within SLA

- Symptom: upload completed, but project stays below minimum-ready longer than expected
- Likely causes:
  - downstream processing backlog
  - required participant asset failure
  - combined or export failure
- Immediate checks:
  - inspect support snapshot SLA section
  - inspect `project.minimum_ready`, `project.fully_ready`, and `project.blocked`
  - inspect failed and pending work items
- Safe remediation:
  - restart the affected worker or clear the relevant operational blocker
- Prohibited actions:
  - do not mark project ready without corresponding asset truth
- Escalation:
  - processing/on-call when SLA breach is confirmed and backlog/worker issues are not self-clearing

### `RB-06` Guest can join but cannot upload or participant-scoped assets are missing

- Symptom: guest successfully joins, then upload or own-asset flow is forbidden or incomplete
- Likely causes:
  - participant-scope mismatch
  - invite lifecycle issue
  - guest attempting owner-only route
- Immediate checks:
  - inspect `guest.access.blocked`, `guest.bootstrap.rejected`, `guest.claim.rejected`
  - confirm guest participant binding and invite state
  - confirm denied route is not owner-only by design
- Safe remediation:
  - reissue invite when lifecycle state is invalid
  - have guest rejoin through the correct invite-bound flow
- Prohibited actions:
  - do not reuse another participant token
  - do not provide owner credentials
- Escalation:
  - auth/on-call when valid invite-bound guest scope still fails

### `RB-07` Database or storage schema mismatch during rollout

- Symptom: app version, schema version, or storage contract is inconsistent after deploy
- Likely causes:
  - partial migration rollout
  - worker version drift
  - storage contract mismatch
- Immediate checks:
  - verify deployed migration state
  - verify backend and worker versions
  - verify storage contract env and TUS contract
- Safe remediation:
  - stop workers first if processing writes are unsafe
  - prefer forward-fix over destructive rollback after additive migrations
- Prohibited actions:
  - do not down-migrate production data blindly
  - do not keep workers running against mismatched schema
- Escalation:
  - release owner immediately
