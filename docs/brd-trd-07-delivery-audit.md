# BRD/TRD 07 Delivery Audit

This document is the BRD/TRD 07 delivery-layer audit for BRD/TRD 01-06.

It exists to keep rollout, rollback, migration, and definition-of-done decisions explicit rather than scattered across prompt outputs or tribal memory.

## Workstream Matrix

| Workstream | Status | Evidence | Remaining Gate |
| --- | --- | --- | --- |
| WS1 Studio and session flow | Implemented | Host/guest studio flow, canonical upload handoff, and guest completion UX are covered by BRD/TRD 03-05 code and tests. | Frontend-wide typecheck still has one unrelated pre-existing issue outside this workstream. |
| WS2 Live upload and recovery | Implemented | TUS-only live path, idempotent initiate/complete/finalize, recovery hints, and participant-scoped guest upload auth are covered in backend services/routes/tests. | None for canonical live flow. Multipart remains manual/import-only. |
| WS3 Processing and combined output | Implemented | Participant asset correctness, combined output determinism, canonical lifecycle/processing gates, and minimum-ready semantics are implemented. | No new gate; continue using worker-process activation for rollout control. |
| WS4 Project and asset presentation | Implemented | Asset-first project API, combined-primary presentation, participant asset groups, minimum-ready vs fully-processed, and consumer-safe project page are live. | None for owner-facing project flow. |
| WS5 Authorization and guest participation | Implemented | Invite-bound guest bootstrap, participant-scoped permissions, guest project denial, and host-only project/admin surfaces are implemented and tested. | None. |
| WS6 Quality, telemetry, and operations | Implemented | Structured telemetry, lifecycle diagnostics, support tooling, BRD 07 delivery/runbook docs, and the BRD 08 QA/acceptance/ops pack now exist. | Frontend media realism still requires manual validation by design. |

## Phase-Close Matrix

| Phase | Status | Close Evidence | Remaining Blocker |
| --- | --- | --- | --- |
| Phase 1 Stabilize current flow | Implemented | Recovery/finalize/stitch gating and deterministic progress truth are covered by backend tests and TUS-only guards. | None. |
| Phase 2 Complete project outputs | Implemented | Combined asset is first-class, participant outputs are first-class, and project minimum-ready is separate from fully-processed. | None. |
| Phase 3 Guest-first experience | Implemented | No-login guest join/upload path works with participant-scoped auth and project-safe boundaries. | None. |
| Phase 4 Product polish and operations | Implemented | Telemetry baseline, lifecycle diagnostics, support tooling, BRD 07 runbooks, and BRD 08 release-evidence/traceability/runbook/severity docs exist. | Manual release evidence still must be captured per candidate. |

## Release Slice and Rollback Matrix

| Release Slice | Default Rollout Boundary | Rollback Boundary | Flag / Gate Decision |
| --- | --- | --- | --- |
| R1 Ingest stabilization | Backend + schema + TUS/live queue path | Roll back backend only if additive schema remains compatible; prefer forward-fix after migration deploy | No new feature flag. Worker process activation and TUS-only route guard are sufficient. |
| R2 Processing truth | Backend + workers + asset read model | Combined/project presentation can be de-emphasized without disabling upload core | No new flag. Existing worker-process gate and `COMBINED_COMPOSITION_MODE` are the active controls. |
| R3 Guest model | Backend auth/token/bootstrap + studio guest UI | Guest token/bootstrap logic can be reverted independently of host-only studio | No new flag. Invite-bound JWT issuance is already the controlled boundary. |
| R4 Project UX and operations | Project page + docs/runbooks/support tooling | Frontend project presentation and support tooling can roll back independently from ingest/processing core | No new flag. Owner-only diagnostics route plus deploy boundary are sufficient. |

## Compatibility and Mixed-State Handling

| Area | Compatibility Rule | Current Handling |
| --- | --- | --- |
| Recording lifecycle | Legacy `recording.status` coexists with canonical `recording.lifecycle_state` during rollout | Normalized in [backend/src/lib/lifecycle-state.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/lib/lifecycle-state.ts) |
| Track lifecycle | Legacy `track.state` coexists with canonical `track.lifecycle_state` | Normalized in [backend/src/lib/lifecycle-state.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/lib/lifecycle-state.ts) |
| Asset readiness | Product payloads read explicit asset entities, not raw storage/files | Implemented in project-assets/participant/combined services |
| Live upload transport | Multipart is not canonical for live recording | Enforced by live chunk routes returning `410` for multipart |
| Mixed historical rows | Unknown historical state must remain explicit, not guessed | No silent backfill of unknown rows; diagnostics route exposes current persisted truth |

## Migration and Backfill Notes

### Additive migrations already introduced
- guest invite lifecycle fields
- canonical recording/track lifecycle fields
- participant/combined/transcript asset tables and timestamps
- BRD 05 lifecycle enum expansion

### Backfill decision
- No automatic historical backfill job is introduced in BRD/TRD 07.
- Existing rows continue through dual-read/controlled-write compatibility.
- Unknown historical lifecycle or readiness remains explicit and is inspectable via lifecycle diagnostics instead of guessed.

### If future backfill is required
- it must be deterministic
- it must be idempotent/resumable
- it must skip rows where canonical truth cannot be derived safely

## Legacy / Deprecation Notes

Canonical product journey:
- studio
- upload handoff
- owner project page
- asset-first project presentation

Legacy/non-product surfaces that remain intentionally isolated:
- manual/import multipart upload flows under `/v1/uploads/*`
- owner-only/operator lifecycle diagnostics
- any leftover admin/diagnostic utilities not linked from the consumer recording journey

Deprecated as canonical behavior:
- live multipart upload as an equivalent studio path
- project readiness inferred from upload timing alone
- admin-style project/debug views as the main project experience

## Governance Notes

Source of truth rule:
- BRD/TRD 01-07 define product and delivery intent.
- Runtime compatibility or rollout shortcuts must be documented in code comments or delivery docs.

Change approval rule:
- A change is not “complete” when code works locally but rollout, rollback, diagnostics, or validation remain implicit.

Definition of done for this program:
1. Product flow is implemented and tested.
2. Compatibility/rollout behavior is documented.
3. Diagnostics/support path exists for blocked states.
4. Validation coverage is explicit, automated where possible, manual where necessary.
5. No known deviation from BRD/TRD 01-07 is left undocumented.
