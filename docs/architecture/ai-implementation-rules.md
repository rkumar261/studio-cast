# AI Implementation Rules

This document is mandatory for any AI agent making changes in this repo.

If this file conflicts with an older prompt or historical planning note, this file wins.

## 1. Primary Goal

Preserve behavior first, improve structure second.

Do not perform broad redesign when a controlled extraction is sufficient.

## 2. File Placement Rules

### Backend
- New HTTP endpoints must go into the correct capability route module.
- Do not keep expanding a giant route file if the endpoint belongs in an extractable module.
- Repositories own Prisma query complexity.
- Services own orchestration and domain behavior.

### Frontend
- Page files compose hooks and components.
- Hooks/view-models own fetch orchestration and data shaping.
- Components render shaped data and handle local interaction only.
- API transport belongs in `lib` clients, not page files.

## 3. Hotspot Protection Rules

The following files are hotspot files and should not absorb more unrelated logic:
- `backend/src/routes/recordings.routes.ts`
- `backend/src/services/project-assets.service.ts`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/projects/useProjectWorkspace.ts`
- `frontend/src/app/studio/[recordingId]/page.tsx`

If changing one of these files:
- prefer extraction into adjacent helpers/modules
- keep the existing public behavior stable
- add or update tests around the affected flow

## 4. Route Rules

- `/projects/[id]` is the canonical detail route
- `/recordings` is archive/utility only
- `/recordings/[id]` remains compatibility-only unless explicitly redesigned
- signed-out `/` goes through `/landing` rewrite behavior

## 5. Comment Standard

Add comments only when they explain:
- why an invariant exists
- why a fallback exists
- why an edge case is handled a certain way
- why a state transition or retry path is constrained
- why a browser/runtime quirk matters

Do not add comments that merely paraphrase the code.

Examples of acceptable comments:
- why `LIVEKIT_WS_URL` falls back in local development
- why auth uses a redirect cookie / session marker
- why polling cadence changes by processing state
- why transcript/export rows are deduped

## 6. Testing Expectations

Every meaningful extraction or refactor should ship with one of:
- focused unit coverage
- Playwright coverage for the affected user flow

Prefer characterization tests before decomposing hotspot internals.

Minimum affected-flow examples:
- auth redirect/session behavior
- upload flow
- project workspace load
- transcript/export shaping
- studio entry flow

## 7. API Client Rules

Do not keep adding unrelated domains into `frontend/src/lib/api.ts` once a domain client exists.

Preferred direction:
- shared `http.ts`
- domain-specific clients layered on top

If a split is in progress:
- preserve compatibility through a barrel export

## 8. Migration Rules

- freeze external contracts first
- extract behavior behind stable interfaces
- do not break route paths or DTO shapes casually
- remove duplication only after preserving behavior

## 9. Review Checklist For Any AI Change

Before finalizing a change, confirm:
- correct module/file placement
- no new business logic buried in page files
- no direct UI coupling to raw backend quirks when a mapper is appropriate
- comments added only where they protect future maintainers
- relevant tests updated or explicitly explained if not run
