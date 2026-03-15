# BRD/TRD 07 Implementation Task

Read first:
`docs/BRD_TRD_07_AI_Implementation_Guide.md`

## Goal
Complete BRD/TRD 07 correctly by:
- verifying what is already implemented
- identifying what remains incomplete across BRD/TRD 01-06 delivery workstreams
- implementing only the missing or partial rollout/migration/operations pieces
- avoiding unnecessary rewrites

## Process
1. Analyze the current codebase and docs against tasks 07-01 through 07-08.
2. Mark each task as:
   - Implemented
   - Partially implemented
   - Missing
3. Produce a concise compliance matrix with evidence and files.
4. Implement only the missing or partial items.
5. Add or update docs, tests, runbooks, or diagnostics for every changed delivery-critical behavior.
6. End with a short verification summary.

## Rules
- Use the guide as the source of truth.
- Do not rebuild already-working BRD 01-06 flows unless BRD/TRD 07 requires it.
- Treat this as a delivery/migration/operations layer, not a product rewrite.
- Keep TUS as the canonical live upload path.
- Keep diagnostics/admin tooling separate from normal product-facing flows.
- Prefer additive migration, compatibility handling, feature flags, and rollback-safe changes.
- Do not guess unknown historical state.
- Keep future work traceable to BRD/TRD 01-07.
- Prefer minimal, focused changes over redesign.

## Output format

### Compliance Matrix
| Task | Status | Evidence | Missing Work | Files |

### Implementation Plan

### Code Changes Made

### Verification
- tests/docs/runbooks added/updated
- what passed
- remaining risks or intentional deferrals

Proceed through analysis, implementation, and testing/verification without waiting for another prompt.
