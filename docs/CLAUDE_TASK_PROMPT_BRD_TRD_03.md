Read first:
docs/BRD_TRD_03_AI_Implementation_Guide.md

Goal:
Complete BRD/TRD 03 correctly. Verify what already exists, finish partial work, and implement only what is missing. Do not rebuild working flows unnecessarily.

Process:

PHASE 1 — Analysis
1. Read the guide fully.
2. Inspect backend schema, auth/invite/bootstrap logic, live routes, LiveKit/signaling/token issuance, frontend guest pre-join and studio flow, People panel, project visibility, observability, and existing tests.
3. For each task 03-01 through 03-09, classify:
   - Implemented
   - Partially implemented
   - Missing
4. Produce a concise compliance matrix with evidence, missing work, and files involved.

PHASE 2 — Implementation
5. Implement only what is needed to satisfy the guide.
6. Preserve working host flows unless a requirement clearly changes them.
7. Complete partial tasks with minimal, focused changes.
8. If schema/API changes are required, add migrations and update affected tests/types.

PHASE 3 — Testing and verification
9. Add or update tests for every changed behavior.
10. Run relevant tests after each logical task group.
11. Finish with a concise summary of:
   - what was already implemented
   - what you changed
   - what remains deferred or risky

Rules:
- Guests join without login.
- Name required; email optional.
- Guest auth must remain invite-bound and participant-scoped.
- Guest client must never receive owner-level credentials.
- Guest cannot act on another participant's tracks/chunks.
- Guest UI must not expose host-only management controls.
- Guest must not automatically receive project page/asset access after upload completion.
- Prefer completing the current architecture over redesigning unrelated modules.

Output format:
## Compliance Matrix
| Task | Status | Evidence | Missing Work | Files |
|------|--------|----------|--------------|-------|

## Implementation Plan
- task order
- files to update
- tests to add/update

## Code Changes Made
- Backend
- Frontend
- Schema/Migrations
- Auth/Live Routes
- Tests

## Verification
- tests run
- results
- remaining risks / intentional deferrals

Proceed through all 3 phases without waiting for another prompt.
