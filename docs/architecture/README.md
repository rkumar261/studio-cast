# Studio Cast Architecture Source of Truth

This document is the canonical architecture standard for Studio Cast.

If this file conflicts with older planning docs, diagrams, or AI prompts, this file wins.

Use this file as the entry point, then follow the detailed standards in:
- [overview.md](overview.md)
- [backend-modules.md](backend-modules.md)
- [frontend-modules.md](frontend-modules.md)
- [state-models.md](state-models.md)
- [request-flows.md](request-flows.md)
- [ai-implementation-rules.md](ai-implementation-rules.md)
- [refactor-roadmap.md](refactor-roadmap.md)
- [adr/ADR-001-projects-first-routing.md](adr/ADR-001-projects-first-routing.md)
- [adr/ADR-002-auth-session-routing.md](adr/ADR-002-auth-session-routing.md)
- [adr/ADR-003-presigned-upload-strategy.md](adr/ADR-003-presigned-upload-strategy.md)
- [adr/ADR-004-project-workspace-asset-graph.md](adr/ADR-004-project-workspace-asset-graph.md)

## 1. Purpose

Studio Cast is a `projects`-first remote recording platform.

The product has four primary user surfaces:
- `Home` (`/`): authenticated dashboard and discovery surface
- `Projects` (`/projects`): primary project index
- `Project Workspace` (`/projects/[id]`): canonical detail/workspace route
- `Studio` (`/studio/[recordingId]`): live session and recording runtime

Secondary surfaces:
- `Recordings` (`/recordings`): archive / utility surface
- `Landing` (`/landing`): signed-out marketing + entry surface
- `Settings` (`/settings`)

## 2. Core Product Flows

### 2.1 Authentication
- Browser lands on `/`
- Signed-out requests are rewritten to `/landing`
- Signed-in requests stay on authenticated routes
- Auth is cookie-based, with frontend session-marker support for routing UX
- Google OAuth is the primary login path

### 2.2 Project Creation
- User creates a project from dashboard actions or project index
- The system currently uses recording-backed project entities
- Canonical destination after creation is `/projects/[id]`

### 2.3 Upload Flow
- User enters upload flow from dashboard or project creation
- Browser uploads via presigned multipart flow
- Successful upload ends in the canonical project workspace

### 2.4 Studio Recording Flow
- Host/guest enter the studio runtime
- Recording/media state is managed in the studio page and studio hooks
- Uploaded chunks / media artifacts later become project assets

### 2.5 Processing Flow
- Backend workers handle stitch, transcode, ASR, export, and maintenance jobs
- Project workspace renders current processing state from API responses
- Project page is the operational center for preview, tracks, transcript, and exports

## 3. System Boundaries

### 3.1 Frontend
- Next.js App Router
- Route groups:
  - `frontend/src/app/(public)`
  - `frontend/src/app/(authenticated)`
- Role:
  - page composition
  - stateful UI
  - view-model shaping
  - API consumption
  - studio runtime UI

### 3.2 Backend
- Fastify API + Prisma/Postgres
- Role:
  - auth/session endpoints
  - recordings/projects domain APIs
  - participant and session APIs
  - project asset graph APIs
  - worker orchestration support
  - analytics summary

### 3.3 Workers
- Background processing for:
  - stitch
  - transcode
  - ASR
  - export
  - maintenance

### 3.4 External Systems
- Postgres
- Cloudflare R2 / S3-compatible object storage
- LiveKit
- Google OAuth
- OpenAI ASR

## 4. Architectural Principles

1. Preserve the current user-facing contracts unless explicitly approved.
   - route paths
   - auth behavior
   - DTO shapes returned to the frontend
   - canonical project route

2. Prefer extraction over rewrite.
   - Large files should be decomposed behind stable interfaces
   - Do not replace working flows wholesale unless the current structure blocks correctness

3. Keep domain logic out of UI components.
   - Components should render and delegate
   - Hooks/view-models should shape data and coordinate UI behavior

4. Keep transport logic out of page files where possible.
   - Pages compose hooks and components
   - API clients and mappers belong in `lib/`

5. Backend layering is mandatory.
   - `routes -> services -> repositories/lib`
   - Route handlers should not become business-logic containers

6. Refactors must be behavior-preserving first, structural second.
   - Add tests first where practical
   - Then extract
   - Then simplify

## 5. Backend Architecture Standard

### 5.1 Allowed Layers
- `routes/`
  - HTTP transport only
  - auth guard use
  - input/output translation
  - error/status mapping
- `services/`
  - orchestration and domain behavior
  - composition of repositories and helper libs
- `repositories/`
  - Prisma query ownership
  - persistence-specific concerns
- `lib/`
  - infrastructure utilities
  - shared helpers with no route ownership
- `dto/`
  - API response/request contracts
- `workers/`
  - background job runners only

### 5.2 Backend Rules
- Route files should be capability-scoped.
  - Good: `analytics.routes.ts`
  - Bad: one giant route file mixing CRUD, session, chunking, diagnostics, and assets
- Services should not mix query loading, UI copy generation, and response shaping when that logic can be separated.
- Repositories should own Prisma query complexity.
- Shared authorization checks should be extracted instead of repeated inline.

### 5.3 Backend Hotspots To Refactor
- [recordings.routes.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/routes/recordings.routes.ts)
  - split into CRUD, assets, session, and chunks route modules
- [project-assets.service.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/services/project-assets.service.ts)
  - split into loader + mapper + action-builder responsibilities

## 6. Frontend Architecture Standard

### 6.1 Allowed Layers
- `app/`
  - route composition only
  - minimal page-local orchestration
- `components/`
  - presentational building blocks
  - local UI interaction only
- `lib/`
  - API clients
  - hooks
  - view-models
  - domain formatting
  - app infrastructure

### 6.2 Frontend Rules
- Page files should compose hooks and components, not become business-logic centers.
- API transport should live in dedicated client modules or a thin shared transport wrapper.
- View-model shaping should happen in hooks or mapper helpers, not inside presentational components.
- Components must not know backend quirks if a mapper can absorb that translation.
- Responsive behavior should be handled inside the component/shell layer, not by route duplication.

### 6.3 Frontend Hotspots To Refactor
- [frontend/src/app/studio/[recordingId]/page.tsx](/Users/rakeshkumar/dev/projects/studio-cast/frontend/src/app/studio/[recordingId]/page.tsx)
  - extract session/devices/recording/invite/layout concerns into hooks/components
- [frontend/src/lib/api.ts](/Users/rakeshkumar/dev/projects/studio-cast/frontend/src/lib/api.ts)
  - split into domain API clients over time
- [frontend/src/lib/projects/useProjectWorkspace.ts](/Users/rakeshkumar/dev/projects/studio-cast/frontend/src/lib/projects/useProjectWorkspace.ts)
  - split into query/actions/mapper concerns

## 7. Commenting Standard

Comments are required only where they prevent future misunderstanding.

Use comments for:
- non-obvious control flow
- protocol assumptions
- worker/job invariants
- auth/session edge cases
- browser/runtime constraints
- temporary compatibility behavior that must not be removed casually

Do not use comments for:
- obvious assignments
- repeating what the code literally says
- vague intention with no concrete decision behind it

Preferred comment style:
- explain `why`, not `what`
- be short and specific
- mention the invariant or risk being protected

Examples of good comment targets in this repo:
- guest vs owner access restrictions
- why a redirect cookie exists
- why a fallback URL exists in development
- why a polling interval changes by state

## 8. AI Implementation Rules

Any AI agent working in this repo must follow these rules:

1. Do not add new endpoints to a giant route file if a capability-specific route module is more appropriate.
2. Do not add more unrelated domains into `frontend/src/lib/api.ts`; prefer domain client extraction.
3. Do not put new business logic directly into page files.
4. Do not couple UI components directly to raw backend response quirks unless there is a deliberate reason.
5. Preserve:
   - `/projects/[id]` as canonical detail route
   - `/recordings` as secondary archive
   - current auth/session behavior unless explicitly changing auth architecture
6. Before refactoring a hotspot, add characterization tests where practical.
7. Prefer behavior-preserving extraction over broad redesign.
8. If architecture docs and older roadmap docs disagree, this file is authoritative.

## 9. Current Truth vs Historical Docs

The following historical assumptions are no longer the primary product truth:
- `recordings`-first detail flow
- TUS as the primary upload path for the active user flows
- “no automated test suite exists”
- “ASR is only a dummy stub”

Current truth:
- canonical detail route is `/projects/[id]`
- active upload path is presigned/multipart for the main flows
- Jest and Playwright suites exist
- real ASR integration exists, though transcript quality still needs hardening

## 10. Required Refactor Roadmap

These are the next architectural cleanup priorities, in order:

1. Split backend recordings route modules
2. Split frontend API client by domain
3. Split `useProjectWorkspace` into query/actions/mapper units
4. Extract studio page orchestration into dedicated hooks and layout components
5. Introduce ADRs for:
   - projects-first routing
   - auth/session routing behavior
   - upload strategy
   - project asset graph ownership

## 11. Supporting Documents

Supplemental diagrams:
- [cache-diagram.mmd](cache-diagram.mmd)
- [data-flow-diagram.mmd](data-flow-diagram.mmd)

These diagrams are supplemental only. If they drift from code or from this document, update them; do not treat them as more authoritative than this file.
