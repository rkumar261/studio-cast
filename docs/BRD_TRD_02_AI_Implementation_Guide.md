# BRD/TRD 02 - Upload Transport, Asset Generation, and Processing Pipeline

## Epic title
Upload Transport, Asset Generation, and Processing Pipeline

## Goal
Implement BRD/TRD 02 end-to-end by validating the current codebase first, then completing any missing or partial behavior without rewriting already-working flows.

## Important working rule
Do not assume every requirement is missing.
For each task below, first inspect the current implementation and classify it as:
- Implemented
- Partially implemented
- Missing

If a task is already implemented, do not rebuild it. Polish it only if necessary to meet the acceptance criteria.
If a task is partially implemented, finish it with minimal invasive changes.
If a task is missing, implement it.

## Delivery method
Work task-by-task in the order below. For every task:
1. Inspect existing backend, frontend, schema, workers, and tests.
2. Classify the task: Implemented / Partially implemented / Missing.
3. List evidence with exact file references.
4. Implement only what is needed to satisfy the acceptance criteria.
5. Add or update tests.
6. Commit cleanly before moving to the next task.

## Required implementation order
1. A1 - TUS-only studio ingest contract
2. A2 - User-visible asset taxonomy implementation
3. A3 - Asset-centric processing gate model
4. A5 - Participant master asset generation
5. A6 - Combined asset composition
6. A7 - Project asset graph API
7. A8 - Project page hierarchy alignment
8. A4 - Studio post-stop participant upload contract
9. A9 - Storage contract cleanup
10. A10 - Reliability, observability, and QA for BRD/TRD 02

---

## A1 - TUS-only studio ingest contract
**Role:** Backend Engineer / Architect  
**Context:** TUS is the canonical transport for live recording uploads. Multipart may remain only for manual, import, or admin-style upload flows.  
**Instruction:** Do not remove multipart globally. Remove or demote it only from the live studio recording path.

### Task
- Audit all live recording upload entry points.
- Disable or deprecate multipart from the studio/live recording flow.
- Keep multipart only for manual/import/admin upload flow.
- Ensure frontend and backend contracts for studio uploads reference TUS only.

### Expected output
- Updated live recording ingest contract
- Removed or demoted multipart live-path code
- Compatibility note for manual/import uploads

### Acceptance criteria
- Live recording flow uses only TUS.
- Multipart is no longer presented as equal parity in studio recording flow.
- Manual/import upload paths still work where intended.

---

## A2 - User-visible asset taxonomy implementation
**Role:** Backend Engineer / Architect  
**Context:** The product must expose participant outputs and combined outputs as explicit persisted assets rather than having the UI infer readiness from raw track state.  
**Instruction:** User-visible downloadable files must map to explicit asset entities, not raw track/chunk structures.

### Task
- Finalize persisted models for participant assets, recording/combined assets, and any required internal assets.
- Define explicit readiness and failure states for each asset type.
- Link assets to recordings and participants.

### Expected output
- Updated schema/models
- Asset-state reference
- Migration files

### Acceptance criteria
- Participant outputs and combined outputs exist as first-class persisted assets.
- UI-facing data no longer depends on raw track/chunk inference.
- Asset readiness is explicit and queryable.

---

## A3 - Asset-centric processing gate model
**Role:** Backend Engineer / Media Pipeline Engineer  
**Context:** Readiness must be computed from explicit asset states and upstream dependencies rather than inferred from chunk counts alone.  
**Instruction:** Upload completion and processing readiness must remain distinct.

### Task
- Refactor readiness logic to use asset-based progression.
- Model blocked reasons for ingest/materialize, track ready, stitch/master build, participant asset build, combined composition, and publish readiness.
- Return explicit blocked reasons through backend contracts where helpful.

### Expected output
- Updated readiness service
- Asset-based state transitions
- Blocked-reason contract

### Acceptance criteria
- Project readiness is derived from asset states, not chunk counts alone.
- Blocked reasons are explicit.
- Late or failing upstream assets do not silently misreport readiness.

---

## A4 - Studio post-stop participant upload contract
**Role:** Frontend Engineer  
**Context:** The studio must stay open after stop, show who is uploaded and who is still uploading, and only expose the project handoff once upload-complete rules are satisfied.  
**Instruction:** Do not let studio stop silently or hide participant-specific upload truth.

### Task
- Show participant-aware upload continuation after stop.
- Keep the page alive until all required participant uploads are complete.
- Show upload-complete state and Go to project CTA only when allowed.

### Expected output
- Updated studio upload-complete UX
- Participant-level upload status rendering
- Upload-complete CTA logic

### Acceptance criteria
- Studio shows separate participant upload statuses after stop.
- Upload-complete state is explicit.
- Go to project appears only when required uploads are complete.

---

## A5 - Participant master asset generation
**Role:** Media Pipeline Engineer  
**Context:** Participant-specific deliverables must become stable user-visible assets rather than hidden intermediate files.  
**Instruction:** Do not expose raw stitched or temp paths as the product contract.

### Task
- Promote stitched/transcoded participant outputs into participant assets.
- Store metadata, duration, preview key, export set, and readiness.
- Expose participant assets through API.

### Expected output
- Participant asset generation step
- Metadata/readiness persistence
- Participant asset API payload

### Acceptance criteria
- Each participant can produce a stable master asset.
- Participant assets are explicit in API responses.
- Project UI does not need raw track paths for participant rows.

---

## A6 - Combined asset composition
**Role:** Media Pipeline Engineer / Architect  
**Context:** The recording must have one explicit combined project output generated after participant masters are available or derivable.  
**Instruction:** Combined composition must be explicit and retry-safe.

### Task
- Define combined asset model.
- Compose participant assets into combined output.
- Store combined metadata, preview path, export set, readiness, and failure reason.
- Add retry and idempotency rules.

### Expected output
- Combined asset pipeline step
- Combined asset metadata contract
- Composition retry rules

### Acceptance criteria
- One primary combined asset exists per recording where applicable.
- Combined asset has explicit readiness state.
- Combined composition failure does not corrupt participant assets.

---

## A7 - Project asset graph API
**Role:** Backend Engineer  
**Context:** The project page must consume an explicit asset graph: combined asset first, then participant assets, with transcript, captions, and export readiness represented as product-facing states.  
**Instruction:** Return product-facing states only.

### Task
- Design a project asset graph endpoint.
- Return combined asset, participant assets, transcript, captions, and export readiness.
- Include labels, preview URLs, download actions, badges, and durations.

### Expected output
- Project assets API
- Typed DTO/contract
- Integration tests

### Acceptance criteria
- Combined and participant assets are distinct in API output.
- UI can render project page without chunk/track inspection.
- States are explicit and user-facing.

---

## A8 - Project page hierarchy alignment
**Role:** Frontend Engineer  
**Context:** The project page must show one combined output row first, followed by participant rows, with clear labels and state visibility.  
**Instruction:** Do not collapse combined and participant outputs into one ambiguous list.

### Task
- Update project landing cards to reflect output summary.
- Build project detail hierarchy with combined first and participant assets second.
- Show badges, preview/play state, downloads, and durations.

### Expected output
- Updated project listing cards
- Project detail asset hierarchy
- Asset cards and badges

### Acceptance criteria
- Combined output is visually primary.
- Participant outputs are clearly attributable.
- Pending, processing, ready, and failed states are visible.

---

## A9 - Storage contract cleanup
**Role:** Backend Engineer / DevOps-minded Engineer  
**Context:** User-visible asset keys must reference stable deliverables and not raw chunk, stitched-temp, or other internal storage paths.  
**Instruction:** User-visible storage keys must never point to chunk or temp locations.

### Task
- Review storage key generation for participant masters, combined outputs, captions, and transcripts.
- Normalize naming and layout contract.
- Ensure API payloads expose only user-visible asset keys.

### Expected output
- Storage naming contract cleanup
- Updated key generation rules
- Validation notes

### Acceptance criteria
- User-visible assets reference stable deliverable keys only.
- Raw chunk/temp paths are not used in product-facing payloads.
- Storage layout is deterministic and documented.

---

## A10 - Reliability, observability, and QA for BRD/TRD 02
**Role:** Backend Engineer / QA-minded Engineer  
**Context:** The ingest, recovery, asset pipeline, and combined output path need automated tests and observable blocked/failed reasons to reduce regression risk.  
**Instruction:** Do not treat upload and processing correctness as only a UI concern.

### Task
- Add or expand tests for TUS recovery, per-track serialization, finalize gating, gap detection, participant asset creation, combined composition retry/failure, and guest-specific upload permissions.
- Add asset-level blocked and failed reason observability.

### Expected output
- Automated tests
- Asset-state observability fields/logs
- Verification report

### Acceptance criteria
- Core ingest, recovery, and asset-pipeline failure modes are covered by tests.
- Asset rows expose blocked or failed reasons.
- Regression risk is reduced for multi-participant upload and processing.

---

## Non-negotiable implementation rules for the coding agent
- Do not rebuild features that already satisfy the acceptance criteria.
- Prefer minimal invasive changes over broad rewrites.
- Preserve existing working APIs unless a task explicitly requires API/schema change.
- If a schema change is necessary, add migration and update tests.
- Treat backend, workers, schema, and frontend as one coordinated system.
- Keep user-facing contracts product-oriented. Do not leak chunk-level or temp-path details.
- Do not mark a task done unless acceptance criteria are met.

## Required output format from the coding agent
Use this exact structure after analysis and after implementation.

### Phase 1 - Compliance matrix
| Task | Status | Evidence | Missing work | Files |
|------|--------|----------|--------------|-------|
| A1 | Implemented / Partial / Missing | ... | ... | ... |
| A2 | Implemented / Partial / Missing | ... | ... | ... |

### Phase 2 - Implementation plan
- Task order to execute
- Files to modify per task
- Tests to add/update per task

### Phase 3 - Code changes made
- Summary of backend changes
- Summary of frontend changes
- Summary of schema/migration changes
- Summary of worker/pipeline changes

### Phase 4 - Verification
- Tests added/updated
- What passed
- Remaining risks or intentional deferrals

## Recommended workflow for the coding agent
Use this method for easiest execution:
1. Analysis-only pass
2. Task-by-task implementation
3. Test after each task
4. Small commits after each task or logical cluster
5. Final end-to-end verification summary

## Definition of done
This epic is complete only when:
- every task A1-A10 is classified and evidenced,
- every missing or partial requirement needed for compliance is implemented,
- tests are updated,
- product-facing asset contracts no longer depend on raw chunk/track inspection,
- the final summary clearly states what was already present and what was newly implemented.
