# Architecture Refactor Roadmap

This roadmap exists to improve structure without breaking current functionality.

This file is now the live backlog for architecture work. Future refactor work should
update status here instead of relying on conversational "next step" prompts.

## Ground Rules

- Preserve current user-visible behavior unless an explicit product change is approved.
- Prefer extraction over rewrite.
- Add or extend tests before decomposing hotspot internals where practical.
- Do not mix behavior changes with structural cleanup in the same patch unless required
  to keep the code compiling.

## Current Status Snapshot

### Completed

- [x] Safety-net coverage added around:
  - auth redirect behavior
  - project workspace loading/dedupe
  - studio invite helpers
  - studio upload-state derivation
  - extracted studio composition components
- [x] Public contracts frozen and documented:
  - route paths
  - auth cookie semantics
  - project workspace as canonical detail route
  - upload and session request flows
- [x] Backend recordings route decomposition:
  - `recordings.crud.routes.ts`
  - `recordings.assets.routes.ts`
  - `recordings.session.routes.ts`
  - `recordings.chunks.routes.ts`
  - shared `recordings.route-helpers.ts`
- [x] Backend project-assets service decomposition:
  - `project-assets.loader.ts`
  - `project-assets.mapper.ts`
  - thin `project-assets.service.ts`
- [x] Frontend API decomposition behind a compatibility barrel:
  - `http.ts`
  - `auth.api.ts`
  - `recordings.api.ts`
  - `analytics.api.ts`
  - `exports.api.ts`
  - `livekit.api.ts`
  - `participants.api.ts`
  - `uploads.api.ts`
  - `transcript.api.ts`
- [x] Frontend project workspace decomposition:
  - `project-workspace.mapper.ts`
  - `project-workspace.types.ts`
  - `useProjectWorkspaceQuery.ts`
  - `useProjectWorkspaceActions.ts`
  - thin `useProjectWorkspace.ts`
- [x] Architecture source-of-truth docs and ADRs added under `docs/architecture/`

### In Progress

- [ ] Studio route isolation in
      [frontend/src/app/studio/[recordingId]/page.tsx](/Users/rakeshkumar/dev/projects/studio-cast/frontend/src/app/studio/[recordingId]/page.tsx)
  - [x] Extract invite helpers
  - [x] Extract media helpers
  - [x] Extract participant tile and icon rendering
  - [x] Extract studio and meet control/header/banner composition
  - [x] Extract studio and meet stage/people panel composition
  - [x] Extract studio pre-join surfaces and meet context-menu UI composition
  - [x] Extract invite/session/upload-state helpers/hooks
  - [x] Extract device orchestration
  - [x] Extract recording orchestration
  - [x] Extract stage/view-model derivation from the route
  - [x] Extract LiveKit/mesh connection coordination and tile/peer mapping
  - [x] Extract studio page upload/people/header view-model assembly
  - [ ] Reduce route file to composition shell + thin coordinator

### Remaining After Studio Isolation

- [ ] Split large logic clusters in
      [backend/src/services/project-assets.mapper.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/services/project-assets.mapper.ts)
  into smaller mappers/builders without changing response shape.
- [ ] Remove stale compatibility shims only after all callers are moved and validated.
- [ ] Resolve Next workspace-root warning by choosing a single lockfile strategy or
      setting `outputFileTracingRoot`.

## Phase A — Safety Nets First

- [x] Add focused characterization tests around:
  - auth redirect behavior
  - project workspace loading
  - project asset dedupe/mapping
  - studio entry and invite behavior

- [x] Freeze public contracts:
  - route paths
  - key DTO shapes
  - auth cookie names and redirect semantics

## Phase B — Backend Decomposition

- [x] Split [recordings.routes.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/routes/recordings.routes.ts) into:
  - `recordings.crud.routes.ts`
  - `recordings.assets.routes.ts`
  - `recordings.session.routes.ts`
  - `recordings.chunks.routes.ts`

- [x] Extract repeated owner/guest authorization helpers.

- [x] Split [project-assets.service.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/services/project-assets.service.ts) into:
  - query loader
  - asset-state mapper
  - action builder/response shaping seams

## Phase C — Frontend Decomposition

- [x] Split [frontend/src/lib/api.ts](/Users/rakeshkumar/dev/projects/studio-cast/frontend/src/lib/api.ts) into:
  - `http.ts`
  - `auth.api.ts`
  - `recordings.api.ts`
  - `analytics.api.ts`
  - `exports.api.ts`
  - `livekit.api.ts`

- [x] Split [frontend/src/lib/projects/useProjectWorkspace.ts](/Users/rakeshkumar/dev/projects/studio-cast/frontend/src/lib/projects/useProjectWorkspace.ts) into:
  - `project-workspace.mapper.ts`
  - `useProjectWorkspaceQuery.ts`
  - `useProjectWorkspaceActions.ts`
  - thin `useProjectWorkspace.ts`

## Phase D — Studio Isolation

- [ ] Break [frontend/src/app/studio/[recordingId]/page.tsx](/Users/rakeshkumar/dev/projects/studio-cast/frontend/src/app/studio/[recordingId]/page.tsx) into:
  - [x] `useStudioSession`-style session state extraction
  - [x] `useStudioDevices`
  - [x] `useStudioRecording`
  - [x] `useStudioInvites`
  - [x] `StudioLayout`-style composition components
  - [x] `ParticipantStage` / meet-stage composition
  - [x] `StudioControlBar`

- [ ] Keep the route file as a composition shell only.

## Phase E — ADRs

- [x] Add ADRs for:
  - projects-first route model
  - auth redirect/session-marker strategy
  - presigned upload as primary active flow
  - project workspace asset graph contract

## Immediate Execution Order

These are the next batches to execute in order, without waiting for a fresh prompt:

1. `Studio route flattening`
   - reduce the route file to composition + hook wiring only
   - keep prejoin flow, recording-session start/stop, and redirects behavior-identical
   - remove any remaining route-local API/session event orchestration that can move into
     coordinator hooks without changing behavior

2. `Project assets mapper cleanup`
   - split formatting/action helpers by concern
   - keep response shape and labels stable

3. `Workspace root warning cleanup`
   - choose and document a single lockfile/output tracing strategy

## Definition of Refactor Completion

The current architecture cleanup is complete only when:

- the studio route is a composition shell rather than a logic hotspot
- backend route and service hotspots are decomposed behind stable contracts
- compatibility barrels are intentionally retained or intentionally removed
- architecture docs match actual module boundaries
- touched slices pass typecheck/lint/tests
