# BRD/TRD 07 Operations Runbook

This runbook is the operator-facing companion to BRD/TRD 07.

Use it for rollout, support triage, and release signoff. Keep it separate from product-facing docs and UI.

## Support Tooling

### Recording support snapshot

```bash
cd backend
API_BASE=http://localhost:8080 \
AUTH_COOKIE='access_token=<cookie>' \
RECORDING_ID='<recording-id>' \
npm run support:recording
```

JSON mode:

```bash
cd backend
API_BASE=http://localhost:8080 \
AUTH_COOKIE='access_token=<cookie>' \
RECORDING_ID='<recording-id>' \
SUPPORT_JSON=1 \
npm run support:recording
```

The snapshot combines:
- `/progress`
- `/project-assets`
- `/lifecycle-diagnostics`

Use it to answer:
- is the project minimum ready?
- what work is still pending?
- what asset or track is blocked?
- is the problem upload, lifecycle, or downstream processing?

## Triage Runbooks

### 1. Upload/recovery issue

Symptoms:
- studio remains in `uploading`
- participant upload count does not converge
- chunk recovery repeatedly suggests stale/ahead sequences

Checks:
1. Run `npm run support:recording` and inspect `pendingWork`.
2. Call `/v1/recordings/:id/lifecycle-diagnostics` and inspect blocked tracks.
3. If needed, run the maintenance worker once:

```bash
cd backend
MAINTENANCE_RUN_ONCE=1 npm run dev:worker:maintenance
```

Expected recovery:
- chunk state converges
- participant upload reaches complete
- recording can move to `upload_complete` then `processing`

### 2. Processing issue

Symptoms:
- upload is complete but combined output is not ready
- project is not minimum ready
- one participant appears ready while another remains stuck

Checks:
1. Confirm worker processes are running in dependency order:
   - `stitch`
   - `transcode`
   - `asr`
   - `export`
2. Run `npm run support:recording`.
3. Check:
   - `project.minimumReady`
   - `project.fullyProcessed`
   - `failedWork`
   - blocked tracks in lifecycle diagnostics

Expected interpretation:
- combined failure should not erase already-ready participant assets
- derivative failure should not remove `minimumReady`

### 3. Guest access issue

Symptoms:
- guest cannot join
- guest upload is denied
- guest reaches project/admin route unexpectedly

Checks:
1. Verify invite token scope and expiry.
2. Inspect `guest.bootstrap.*`, `guest.claim.*`, and `guest.access.blocked` telemetry.
3. Confirm the denied route is one of the owner-only routes:
   - recording detail
   - project assets
   - lifecycle diagnostics

Expected behavior:
- guest is invite-bound and participant-scoped
- guest can join/session/upload/recovery for own participant
- guest cannot access owner project/admin surfaces

## Rollout / Rollback Checklist

### Rollout
1. Apply additive Prisma migrations with `npx prisma migrate deploy`.
2. Run `npm run prisma:gen`.
3. Run backend validation:
   - `npm run build`
   - `npm run test`
4. Start workers in dependency order.
5. Run frontend validation:
   - `npm test`
   - `npm run build` or fallback typecheck if local frontend toolchain is incomplete
6. Run acceptance checklist below against one real recording flow.

### Rollback
1. Stop workers first if the issue is processing-related.
2. Roll back frontend independently if the issue is presentation-only.
3. Prefer forward-fix over database rollback once additive migrations are deployed.
4. Use the support snapshot plus lifecycle diagnostics before deciding rollback scope.

## Release Signoff Checklist

- Host can create, start, stop, and hand off a recording to project view.
- Guest can join without login, record/upload, and does not get project admin access.
- Live upload path is TUS-only; live multipart routes return `410`.
- Combined asset is primary on the project page.
- Participant assets are visible as first-class groups.
- Project `minimumReady` and `fullyProcessed` are distinct.
- Lifecycle diagnostics route works for owner and rejects guest.
- Telemetry is present for upload, finalize, processing, combined, participant asset, and guest auth events.

## Acceptance Pack

### Automated coverage
- backend unit/route tests for upload/recovery/finalize/processing/project-assets/guest auth
- frontend unit tests for recording-journey helpers
- `backend npm run acceptance:recording` for final-ready verification against a real recording

### Manual verification

| Area | Manual Step | Pass Criteria |
| --- | --- | --- |
| Host flow | Record, stop, remain on studio, open project | Upload handoff is clear and project opens before optional derivatives finish |
| Guest flow | Join from invite without login and upload | Guest can complete upload and cannot open owner project routes |
| Upload recovery | Interrupt network during upload and resume | Recovery hints converge and no duplicate logical chunks appear |
| Combined output | Wait for processing to begin | Combined output becomes primary playable asset |
| Participant outputs | Use at least one guest + host | Each participant appears as a first-class asset group |
| Operations | Run `npm run support:recording` | Operator can identify pending/failed work and blocked tracks quickly |

### Known manual-only gap
- Full frontend typecheck/build remains affected by the unrelated pre-existing `frontend/src/lib/studio/recorder-seq.ts` error until that file is fixed.
