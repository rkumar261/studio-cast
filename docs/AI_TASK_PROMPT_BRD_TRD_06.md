# BRD/TRD 06 Implementation Task

Read first:
`docs/BRD_TRD_06_AI_Implementation_Guide.md`

## Goal
Complete BRD/TRD 06 correctly by:
- verifying what is already implemented
- finishing partial work
- implementing only what is missing
- avoiding unnecessary rewrites

## Process
1. Analyze the current code against tasks 06-01 through 06-08.
2. Mark each task as:
   - Implemented
   - Partially implemented
   - Missing
3. Produce a concise compliance matrix with evidence and files.
4. Implement only the missing or partial items.
5. Add or update tests for every changed behavior.
6. End with a short verification summary.

## Rules
- Use the guide as the source of truth.
- Do not rebuild already-working BRD 02, 03, 04, or 05 flows unless BRD/TRD 06 requires it.
- Keep project APIs asset-first and product-facing.
- Combined output is the primary project playback asset.
- Participant outputs must remain first-class asset groups.
- Minimum-ready and fully-processed are separate concepts and must stay separate.
- Do not expose raw chunk lists, stitch internals, worker/job terminology, or internal file-path thinking in product APIs or UI.
- Keep retries/reprocessing deterministic and convergent on stable asset identity.
- Keep guest access project-safe unless the guide explicitly requires otherwise.
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
