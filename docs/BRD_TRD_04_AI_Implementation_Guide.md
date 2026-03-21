# BRD/TRD 04 AI Implementation Guide

## Title
**BRD/TRD 04 — Studio UX, Upload States, Recording Completion, and Project Presentation**

## Source of truth
This guide is derived from:
- BRD 04
- TRD 04
- BRD/TRD 04 Implementation Task Register

Use those documents as the source of truth if any wording here needs clarification.

---

## Goal
Complete BRD/TRD 04 correctly by:
- verifying what is already implemented
- finishing partial work
- implementing only what is missing
- avoiding unnecessary rewrites

This scope is about the **consumer-facing recording journey**, not low-level transport details.

The user-facing journey must be ordered and easy to understand:

### Host
host enters studio -> records -> stops -> stays on studio while uploads continue -> sees upload-complete in studio -> clicks **Go to project** -> views project page while processing or ready

### Guest
invite URL -> welcome -> prejoin/device check -> required name / optional email -> join without login -> after leave/stop sees keep-open upload state -> sees final upload-complete state

---

## Core user-facing state vocabulary
Use a small fixed vocabulary for consumer-facing state.

Allowed user-facing states:
- `recording`
- `uploading`
- `upload complete`
- `processing`
- `ready`
- `action required`

Do **not** leak low-level worker, chunk, track, or storage terminology in consumer-facing routes or UI.

---

## Task baseline and execution order
Implement in this order unless a dependency clearly forces a small adjustment:

1. **04.1 — Backend aggregate endpoint and state vocabulary cleanup**
2. **04.2 — Host studio canonical state model**
3. **04.3 — Guest prejoin and join UX alignment**
4. **04.4 — Guest post-upload completion flow**
5. **04.5 — Studio post-stop participant upload experience**
6. **04.6 — Studio-to-project handoff**
7. **04.7 — Project page combined + participant asset presentation**
8. **04.8 — Consumer vs admin/diagnostic route separation**

---

## Task 04.1 — Backend aggregate endpoint and state vocabulary cleanup

### Objective
Return intentional backend aggregates that let the frontend render studio and project views without deriving product meaning from raw chunk or worker tables.

### Required behavior
- Provide studio-ready participant list, role labels, upload state, and recording state vocabulary.
- Provide truthful participant-scoped upload progress.
- Provide normalized project asset summary for:
  - combined asset
  - participant assets
  - transcript
  - captions
  - exports
- Map backend truth into the fixed vocabulary:
  - recording
  - uploading
  - upload complete
  - processing
  - ready
  - action required

### Acceptance criteria
- Studio route can render participant list, role labels, and upload states from intentional aggregate data.
- Project route can render combined and participant asset summary from a single intentional response model.
- User-facing state values are explicit and do not leak low-level chunk/worker terminology.

---

## Task 04.2 — Host studio canonical state model

### Objective
Use one canonical host state model instead of scattered booleans.

### Canonical host phases
- `host_prepared`
- `recording_active`
- `stop_requested`
- `uploading_after_stop`
- `studio_upload_complete`
- `project_processing`
- `project_ready`

### Required behavior
- Refactor the host studio page to use one explicit phase model or state machine.
- Map backend recording/upload truth into ordered host states.
- Drive:
  - top status pill/banner
  - upload overlay/card
  - CTA visibility
  - transition copy
  from the canonical phase only.

### Acceptance criteria
- After stop, the studio enters upload phase instead of ending silently.
- Top-of-studio state language stays short, consistent, and truthful.
- CTA behavior is driven by canonical state instead of ad-hoc booleans.

---

## Task 04.3 — Guest prejoin and join UX alignment

### Objective
Align the guest journey to the required invite-first, no-login flow.

### Required behavior
- Invite URL opens a guest landing/welcome screen.
- Guest sees a prejoin screen with:
  - device check
  - required display name
  - optional email
  - join action
- Guest joins without account creation or login.
- Guest role messaging is explicit in the guest flow and session.

### Acceptance criteria
- Guest reaches session without login.
- Name validation blocks join until provided.
- Email remains optional.
- Guest appears as a distinct participant in session.

---

## Task 04.4 — Guest post-upload completion flow

### Objective
Keep the guest route alive after leave/stop so guest upload states remain visible without project access.

### Required behavior
- Implement `guest_uploading_after_leave` keep-open state.
- Implement `guest_upload_complete` final completion state.
- Keep post-upload guest flow on a consumer-facing route.
- Do not require project permissions for the guest completion flow.

### Acceptance criteria
- After guest leave/stop, upload instruction screen appears while local upload continues.
- After upload finishes, guest sees a final completion state and can close the page.
- Guest is not redirected to a project page or internal diagnostic page to understand completion.

---

## Task 04.5 — Studio post-stop participant upload experience

### Objective
Make the studio route the operational post-stop surface with participant-aware upload truth.

### Required behavior
- Build or refine a post-stop upload dialog/card/panel on the studio route.
- Render participant upload rows showing:
  - name
  - role
  - upload state
  - percentage
  - blocked reason when applicable
- Render recording-level summary and keep-page-open guidance.
- Keep upload-complete success on the same studio surface.

### Acceptance criteria
- Host can see who is still uploading and who is done.
- Studio remains open and understandable during post-stop upload.
- Action-required states are explicit and identify the affected participant when possible.

---

## Task 04.6 — Studio-to-project handoff

### Objective
Show upload-complete in studio first, then allow project navigation.

### Required behavior
- Compute session upload-complete from required participant uploads.
- Expose **Go to project** only when upload-complete rules are satisfied.
- Allow project page to open while processing is still ongoing.
- Keep wording/state alignment consistent between studio upload complete and project processing.

### Acceptance criteria
- User sees clear upload-complete confirmation in studio.
- Project page opens even while processing is ongoing.
- No silent transition from stop directly to project without upload confirmation.

---

## Task 04.7 — Project page combined + participant asset presentation

### Objective
Present one combined output first, then participant-specific outputs in a clean and stable hierarchy.

### Required behavior
- Build or refine the project landing card behavior to summarize readiness.
- Build the project detail page hierarchy with:
  - primary combined asset section first
  - participant asset rows/cards after
- Show:
  - processing badges
  - previewability
  - duration
  - download actions
- Keep ordering stable:
  - combined first
  - participant assets after

### Acceptance criteria
- Combined asset is shown as the primary output.
- Participant assets are attributable to named participants.
- Ready / processing / failed states are visible and understandable.
- UI does not depend on raw track/chunk/path inspection.

---

## Task 04.8 — Consumer vs admin/diagnostic route separation

### Objective
Keep raw operational details out of the primary consumer journey.

### Required behavior
- Identify end-user routes/components that expose chunk counts, raw track internals, or low-level export/job detail.
- Remove or de-emphasize those details from the consumer journey.
- Keep studio and project routes product-facing and ordered.
- Preserve diagnostic tooling only as internal/admin surfaces where needed.
- Document which routes/components are consumer-facing versus internal only.

### Acceptance criteria
- End users do not need chunk counts or raw pipeline detail to understand progress/readiness.
- Studio and project routes remain clean consumer-facing surfaces.
- Diagnostic screens remain internal/operational only.

---

## Cross-cutting rules
- Do not rebuild working BRD 02 or BRD 03 flows unnecessarily.
- Prefer minimal, focused changes over broad rewrites.
- Keep user-facing state language simple and product-oriented.
- Do not leak raw chunk paths, worker/job internals, or storage internals into consumer-facing UI/contracts.
- Preserve role boundaries:
  - host controls stay host-only
  - guest completion flow stays project-safe
- If a route or component is diagnostic-only, keep it out of the main consumer journey.
- Add or update tests for every changed behavior.
- If frontend contract changes are required, update types and affected tests.

---

## Suggested implementation checklist
For each task:
1. verify current implementation
2. classify as:
   - implemented
   - partially implemented
   - missing
3. implement only the missing/partial pieces
4. add tests
5. record concise verification notes

---

## Output format expected from the coding agent

### Compliance Matrix
| Task | Status | Evidence | Missing Work | Files |

### Implementation Plan
- task order
- files to update
- tests to add/update

### Code Changes Made
- Backend
- Frontend
- DTO/contracts
- Tests
- Docs/notes if applicable

### Verification
- tests added/updated
- what passed
- remaining risks or intentional deferrals
