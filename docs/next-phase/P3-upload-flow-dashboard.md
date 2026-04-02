# P3 — Upload Flow into the Project Workspace

**Priority:** HIGH  
**Status:** Not started on the refreshed plan  
**Blocks:** Home quick-action completeness, project-first creation flow  
**Effort:** Human ~2 days / CC ~30-45 min

---

## Why This Doc Changed

The older version assumed a recordings-first flow:
- upload from home
- create a recording shell
- redirect to `/recordings/:id`

The current product is `projects`-first:
- `Home` is the dashboard
- `/projects` is the primary index
- `/projects/[id]` is the canonical workspace
- `/recordings` is only an archive

So upload must end in the canonical project workspace, not the archive/detail route.

## Current Problem

The home quick-action `Upload` exists in the redesigned dashboard, but it currently routes users to the archive surface instead of a real upload workflow.

Current behavior:
- `record` -> creates a recording and opens `/studio/:id?mode=studio`
- `edit` -> latest project
- `go-live` -> meet room
- `schedule` -> `/projects`
- `upload` -> `/recordings`

That is not the intended final experience.

## Goal

Provide a dedicated upload flow that:
1. starts from the home dashboard
2. creates a draft project shell
3. uploads pre-recorded media using existing backend upload APIs
4. lands the user in `/projects/[id]`

## Recommended Route

Use a dedicated authenticated route:

```text
/projects/new?mode=upload
```

Why:
- keeps the `projects`-first IA intact
- allows future `mode=create` / `mode=upload` branching if needed
- makes completion routing to `/projects/[id]` natural

## Existing Backend Support

Backend upload infrastructure already exists:
- `POST /v1/uploads/initiate`
- `POST /v1/uploads/:id/complete`
- related upload routes in `backend/src/routes/uploads.routes.ts`

The missing part is the frontend flow and the `projects`-first route wiring.

## Implementation Plan

### Step 1 — Rewire the dashboard Upload action

Update:
- `frontend/src/lib/dashboard/useHomeViewModel.ts`

Change the `upload` quick action so it navigates to:

```text
/projects/new?mode=upload
```

Do not keep `/recordings` as the upload destination.

### Step 2 — Create the upload entry page

Add:
- `frontend/src/app/(authenticated)/projects/new/page.tsx`

This page should:
- inspect `searchParams.mode`
- show the upload-specific UI when `mode=upload`
- optionally support future plain “new project” creation if needed

### Step 3 — Build upload UI components

Recommended components:
- `frontend/src/components/upload/FileUploadZone.tsx`
- `frontend/src/components/upload/UploadProgress.tsx`

Capabilities:
- drag and drop
- click-to-browse
- file validation
- upload progress
- failure state / retry messaging

Accepted types:
- `.mp4`
- `.mov`
- `.webm`
- `.wav`
- other explicitly supported audio/video types already accepted by backend

### Step 4 — Create project shell first

On file select:
1. call the existing recording/project creation API
2. get back the new recording/project id
3. use that id as the canonical future `/projects/[id]` route

For now, project identity still maps to recording identity. That is acceptable and consistent with the current architecture.

### Step 5 — Add frontend upload API wrappers

Add wrappers in:
- `frontend/src/lib/api.ts`

Needed calls:
- initiate upload
- complete upload

If multipart presigned URLs are used, expose the minimal typed helpers needed for the upload page.

### Step 6 — Upload and complete

Flow:

```text
Home dashboard
  -> Upload quick action
  -> /projects/new?mode=upload
  -> create draft project shell
  -> initiate upload
  -> upload parts / chunks
  -> complete upload
  -> redirect to /projects/:id
```

### Step 7 — Land in the canonical project workspace

After upload completion:
- redirect to `/projects/[id]`
- do not redirect to `/recordings/[id]`
- do not use `/recordings` as the post-upload destination

## Suggested Files To Create

| File | Purpose |
|------|---------|
| `frontend/src/app/(authenticated)/projects/new/page.tsx` | Upload entry route |
| `frontend/src/components/upload/FileUploadZone.tsx` | File selection/drop |
| `frontend/src/components/upload/UploadProgress.tsx` | Upload progress UI |

## Suggested Files To Change

| File | Change |
|------|--------|
| `frontend/src/lib/dashboard/useHomeViewModel.ts` | Rewire Upload quick action |
| `frontend/src/lib/api.ts` | Add upload wrappers if absent |

## Verification

1. Click `Upload` from home.
2. Confirm navigation goes to `/projects/new?mode=upload`.
3. Select a supported media file.
4. Upload completes successfully.
5. Completion redirects to `/projects/[id]`.
6. The resulting project shows uploaded media in the canonical workspace.
7. Run:

```bash
cd frontend && npm run typecheck
cd frontend && npm run lint
```
