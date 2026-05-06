# Architecture Overview

This document explains the current product shape and system boundaries at a level that should stay stable even as modules are refactored.

If this document conflicts with older roadmap notes, follow this document and update the older notes later.

## 1. Product Shape

Studio Cast is a `projects`-first remote recording platform.

Primary surfaces:
- `Home` at `/`
- `Projects` at `/projects`
- `Project Workspace` at `/projects/[id]`
- `Studio` at `/studio/[recordingId]`

Secondary surfaces:
- `Recordings` archive at `/recordings`
- signed-out `Landing` at `/landing`
- `Settings` at `/settings`

Important product rule:
- `/projects/[id]` is the canonical detail route
- `/recordings/[id]` exists only as a compatibility redirect

## 2. System Shape

The product is split into four runtime areas:
- `frontend`: Next.js App Router app for dashboard, projects, archive, and studio UI
- `backend`: Fastify API for auth, recordings/projects domain, participants, uploads, transcripts, analytics, and worker support
- `workers`: background jobs for stitch, transcode, ASR, export, and maintenance
- `external systems`: Postgres, R2, LiveKit, Google OAuth, OpenAI ASR

## 3. Frontend Responsibility

The frontend owns:
- route composition
- authenticated vs public shell behavior
- user interaction state
- browser upload orchestration
- workspace presentation
- studio runtime UI

The frontend does not own:
- durable media state
- canonical project asset truth
- transcript/export persistence
- job execution

## 4. Backend Responsibility

The backend owns:
- auth/session cookies and OAuth callback handling
- project/recording data truth
- participant and invite state
- upload orchestration contracts
- project asset graph responses
- transcript/export persistence
- analytics summaries
- worker job orchestration and data access

The backend does not own:
- page-level UI state
- route-group shell logic
- component-specific presentation details unless they are part of an API contract

## 5. Current Canonical Flows

### Authentication
- signed-out requests to `/` are rewritten to `/landing`
- signed-in requests stay on authenticated routes
- frontend uses session-marker behavior for UX routing
- backend cookies remain the source of truth for auth

### Project Creation
- user starts from dashboard or project index
- current project records are recording-backed
- user lands on `/projects/[id]`

### Upload
- dashboard or project-create flow opens upload UX
- browser uploads through presigned multipart
- success lands on `/projects/[id]`

### Studio
- host/guest join `/studio/[recordingId]`
- live session logic is browser-heavy and hook-driven
- artifacts later appear in project workspace

### Processing
- workers build combined assets, transcripts, captions, and exports
- project workspace renders current processing truth from backend APIs

## 6. Key Architectural Constraints

- Preserve canonical routes unless explicitly approved
- Prefer extraction over rewrite
- Keep page files thin
- Keep backend route handlers thin
- Keep DTO contracts stable during refactors
- Add tests before changing hotspot internals

## 7. Known Structural Hotspots

These files need controlled decomposition and should not absorb more unrelated logic:
- `backend/src/routes/recordings.routes.ts`
- `backend/src/services/project-assets.service.ts`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/projects/useProjectWorkspace.ts`
- `frontend/src/app/studio/[recordingId]/page.tsx`

## 8. Commenting Policy

Comments should explain:
- invariants
- edge-case reasoning
- compatibility behavior
- protocol assumptions
- state-transition constraints

Comments should not restate obvious code.

The detailed rules live in [ai-implementation-rules.md](ai-implementation-rules.md).
