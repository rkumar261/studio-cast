# Frontend Modules Standard

This document defines the current frontend architecture and the rules future work must follow.

## 1. Frontend Layering

Allowed dependency direction:
- `app pages/layouts -> hooks/view-models -> components -> api/http`

Supporting utilities may exist in `lib/` and be used by hooks/components when appropriate.

Disallowed:
- page files absorbing domain logic
- presentational components parsing raw backend quirks directly when a mapper can absorb them
- unrelated domains continuing to accumulate inside one giant API module once a split exists

## 2. Route Group Rules

### Public
Located in:
- `frontend/src/app/(public)`

Owns:
- landing
- auth-adjacent signed-out entry
- navbar-only surfaces

### Authenticated
Located in:
- `frontend/src/app/(authenticated)`

Owns:
- workspace shell
- home
- projects index
- project workspace
- recordings archive
- settings
- project upload entry

Important rule:
- workspace shell belongs in route-group layout, not in page files

## 3. Page File Rules

Page files should:
- compose hooks and components
- own route params/search params wiring
- own small route-local decisions

Page files should not:
- fetch multiple domains inline if a hook exists
- build large view models inline
- contain reusable business rules

## 4. Hook / View-Model Rules

Hooks are the preferred place for:
- orchestration
- fetch/poll coordination
- action execution
- shaping backend data into page-friendly structures

Preferred split for large hooks:
- query/data hook
- actions hook
- mapper helper
- small composer hook

## 5. Component Rules

Components should:
- render shaped data
- manage local UI state only
- support responsive behavior

Components should not:
- know raw backend contract oddities
- perform multi-domain fetch orchestration
- own canonical workflow state when a hook can own it

## 6. API Client Rules

Current hotspot:
- `frontend/src/lib/api.ts`

Target split:
- `http.ts`
- `auth.api.ts`
- `recordings.api.ts`
- `analytics.api.ts`
- `exports.api.ts`
- `livekit.api.ts`

During migration:
- preserve exported surface through a barrel to avoid breaking callers

## 7. Studio Rules

The studio route is the largest frontend hotspot.

Target decomposition:
- `useStudioSession`
- `useStudioDevices`
- `useStudioRecording`
- `useStudioInvites`
- `StudioLayout`
- `ParticipantStage`
- `StudioControlBar`

Important:
- extract, do not redesign blindly
- preserve existing recording behavior and route semantics

## 8. Projects Workspace Rules

Canonical route:
- `/projects/[id]`

Required page order on standard screens:
- header
- processing/status banner
- preview/hero
- tracks/artifacts
- transcript/editor

`/recordings` remains a secondary archive and must not become the primary detail route again without an explicit decision.

## 9. Commenting Requirements

Frontend comments are required for:
- auth redirect reasoning
- upload/browser constraints
- polling behavior
- state-sync edge cases
- deliberate compatibility fallbacks

Frontend comments are not needed for:
- simple JSX structure
- trivial handlers
- obvious state setters
