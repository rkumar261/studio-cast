# Task 20 Release Readiness, Migration, and Rollback Plan

This plan is a staged rollout/rollback guide for implemented Tasks 02-19.

## 1) Migration Checklist

Pre-release (mandatory):

1. Confirm DB target and backup point.
2. Confirm `backend/.env` for:
   - Postgres connectivity
   - TUS contract (`MEDIA_ROOT`, `TUSD_UPLOAD_DIR`, `UPLOAD_TUS_BASE_URL`)
   - R2 credentials
   - JWT keys
3. Confirm runtime services reachable:
   - Postgres
   - tusd
   - storage bucket endpoint
4. Validate migration state:

```bash
cd backend
npx prisma migrate status
```

Release migration step:

```bash
cd backend
npx prisma migrate deploy
npm run prisma:gen
```

Backend validation after migration:

```bash
cd backend
npm run build
npm run test
```

Frontend validation gate:

```bash
cd frontend
npm run test
npm run build
```

## 2) Release Order (Controlled Sequence)

### Stage A: Schema first (Tasks 02, 09, 10, 14)
- Apply all pending Prisma migrations before API/frontend release.
- Do not start workers until backend API is on the matching schema.

Validation checkpoint:
- `migrate deploy` succeeds.
- Backend starts without missing-column/runtime query errors.

Rollback boundary:
- If migration fails, stop rollout and keep previous app version.
- If migration already applied, use forward-fix (preferred) or restore DB backup.

### Stage B: Backend contracts and guards (Tasks 03, 07, 08, 11, 17, 19)
- Deploy backend with:
  - participant-scoped guest auth
  - idempotent initiate/complete and reconciliation hints
  - finalize/stitch gating
  - project asset graph response
  - structured telemetry
  - live transport TUS-only guardrails

Validation checkpoint:
- Core API smoke:
  - guest bootstrap
  - recording start/stop
  - chunk initiate/complete/recovery
  - finalize
  - project-assets response
- Multipart live chunk routes return explicit deprecation response (`410`).

Rollback boundary:
- Safe to roll backend back if schema is additive-compatible.
- If backend rollback is needed after Stage C/D, keep frontend pinned or verify contract compatibility first.

### Stage C: Worker activation in dependency order (Tasks 08, 09, 10, 14, 16, 17)
- Start workers progressively:
  1. `stitch`
  2. `transcode`
  3. `asr`
  4. `export`
  5. `maintenance` (optional cycle)

Commands:

```bash
cd backend
npm run dev:worker:stitch
npm run dev:worker:transcode
npm run dev:worker:asr
npm run dev:worker:export
```

Validation checkpoint:
- For a stopped recording:
  - stitch job queued/runs
  - participant assets transition to `ready`
  - combined asset transitions to `ready`
  - transcript transitions (`pending/processing/ready/failed`)
  - exports transition (`queued/running/succeeded` or explicit `failed`)
- Telemetry contains correlated lifecycle events.

Rollback boundary:
- Worker rollback is isolated: stop worker process(es), no schema rollback required.
- Existing queued/running jobs remain in DB; can be retried after worker restart.

### Stage D: Frontend state/UI rollout (Tasks 04, 05, 06, 12, 13, 15, 19)
- Deploy frontend after backend+worker contracts are live.
- Frontend expectations:
  - guest no-login pre-join flow
  - canonical host studio upload/handoff states
  - project combined/participant asset presentation
  - transcript viewer/edit/publish UX
  - live upload transport fixed to TUS-only

Validation checkpoint:
- Browser smoke:
  - guest join path
  - host record -> stop -> upload progress -> handoff CTA
  - project page loads while processing
  - transcript panel search/seek/edit/publish

Rollback boundary:
- Frontend can roll back independently if backend contracts are additive.
- Keep studio transport config aligned (no old UI should rely on live multipart).

## 3) Feature Flag / Rollout Gate Notes

No new feature flags are required for this release set.

Existing operational gates:

1. Worker-process gate (primary): each pipeline stage can be activated/deactivated by starting/stopping the corresponding worker process.
2. Composition mode gate: `COMBINED_COMPOSITION_MODE` (`concat_all` / `primary_only`) controls combined output behavior without schema/API change.
3. Transport gate is now hard-coded for live path:
   - live recording chunk routes are TUS-only
   - multipart is retained for `/v1/uploads/*` manual/import/admin flow

## 4) Rollback Notes and Partial-Release Safeguards

General safeguards:

1. Treat schema changes as additive-forward: prefer forward-fix over down migration.
2. Keep a DB backup/snapshot before Stage A.
3. Keep backend and worker versions in lockstep with schema version.
4. Use telemetry (Task 17) to distinguish upload failures from processing failures before rollback.

Partial-release safe combinations:

1. **Schema + backend only**: safe; frontend can lag.
2. **Backend without workers**: safe; recordings remain in upload/processing states until workers resume.
3. **Workers without frontend update**: safe for backend processing; UI improvements may lag.
4. **Frontend without backend**: unsafe for contract-dependent features (guest bootstrap, project asset graph, TUS-only live enforcement) and should be avoided.

Orphan/incompatibility prevention:

1. If rollback is required after workers wrote new asset/transcript/export rows, keep DB and backend schema at current migration level.
2. Do not roll backend to a version that lacks awareness of existing lifecycle fields/states.
3. For emergency stabilization, stop workers first, then rollback frontend/backend as needed.

## 5) Risky Cross-Task Dependencies

1. Task 06 (queue/recovery) + Task 07 (idempotent initiate/complete) + Task 08 (finalization gating):
   - Must ship together for stable post-stop upload correctness.
2. Task 09 participant assets + Task 10 combined asset + Task 11 project asset graph + Task 12 project UI:
   - Backend asset model/API and UI contract are tightly coupled.
3. Task 14 transcript model + Task 15 transcript UI + Task 16 captioned export:
   - Transcript publish/revision state is prerequisite for caption export validity.
4. Task 05 host handoff + Task 13 studio-to-project transition:
   - UI state consistency depends on backend progress/readiness contracts.
5. Task 19 transport deprecation + Task 06 live queue:
   - Live studio must be TUS-only end-to-end; legacy multipart live routes are intentionally blocked.

## 6) Validation Steps per Visible Release Boundary

Boundary A (schema/backend startup):
1. Backend boots cleanly after migration.
2. No missing column/query runtime errors.

Boundary B (studio upload flow):
1. Start/stop recording works.
2. Upload continues post-stop with participant-aware progress.
3. Live multipart chunk calls return `410`.

Boundary C (processing readiness):
1. Finalized gapful tracks do not stitch.
2. Stitch/transcode/asr/export progress visible in telemetry and API states.

Boundary D (project experience):
1. Project API returns combined + participant assets explicitly.
2. Project UI renders combined as primary and participant assets separately.
3. Processing/pending/failed states are explicit and user-visible.

Boundary E (transcript/caption):
1. Transcript transitions and revision/publish are explicit.
2. Captioned export is produced only from publishable transcript state.

