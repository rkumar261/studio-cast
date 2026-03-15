# BRD/TRD 04 Implementation Task

Read first:
`docs/BRD_TRD_04_AI_Implementation_Guide.md`

## Goal
Complete BRD/TRD 04 correctly by:
- verifying what is already implemented
- finishing partial work
- implementing only what is missing
- avoiding unnecessary rewrites

## Process
1. Analyze the current code against tasks 04.1 through 04.8.
2. Mark each task as:
   - Implemented
   - Partially implemented
   - Missing
3. Produce a concise compliance matrix with evidence and files.
4. Implement only the missing or partial items.
5. Add or update tests for every changed behavior.
6. End with a short verification summary.

## Rules
- Use the guide document as the source of truth.
- Do not rebuild already-working BRD 02 or BRD 03 flows unless required by BRD/TRD 04.
- Use the fixed consumer-facing vocabulary:
  - recording
  - uploading
  - upload complete
  - processing
  - ready
  - action required
- Do not expose raw chunk counts, worker details, raw storage paths, or diagnostic internals in consumer-facing routes or UI.
- Keep studio and project routes consumer-facing.
- Keep admin/diagnostic tooling separate from the primary user journey.
- Guests must still join without login.
- Guest upload-complete flow must remain available without project permissions.
- Prefer minimal, focused changes over redesign.

## Output format

### Compliance Matrix
| Task | Status | Evidence | Missing Work | Files |

### Implementation Plan

### Code Changes Made

### Verification
- tests added/updated
- what passed
- remaining risks or intentional deferrals

Proceed through analysis, implementation, and testing without waiting for another prompt.
