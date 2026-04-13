# P4 — Studio Visual Harmonization

**Priority:** MEDIUM  
**Status:** Ready after doc refresh  
**Depends on:** Dashboard/workspace shell is already shipped  
**Effort:** Human ~1 day / CC ~20-30 min

---

## Why This Doc Changed

The older version assumed the dashboard redesign had not shipped yet.

That is no longer true:
- the authenticated shell already exists
- dashboard/home/projects/project workspace already use shared workspace styling

The remaining need is still valid: studio and studio-adjacent pages visually lag behind the new workspace shell.

## Problem

These pages still feel visually older than the dashboard/workspace surfaces:
- `frontend/src/app/studio/[recordingId]/page.tsx`
- `frontend/src/app/studio/[recordingId]/thanks/page.tsx`

The current mismatch is mainly about:
- color tokens
- borders / card surfaces
- typography consistency
- button and badge styling

## Goal

Harmonize studio visuals with the dashboard design system without touching recording behavior.

## Hard Rule

This phase is visual-only.

Do **not**:
- restructure the core recorder flow
- alter media device / upload / signaling behavior
- refactor the giant studio state machine unless absolutely required for styling hooks

## In Scope

- token cleanup
- consistent card surfaces
- header / toolbar styling
- participant tile visual cleanup
- thanks page styling pass

## Out of Scope

- `/start`, `/tech-check`, or `/meet` route redesign
- mobile responsiveness beyond small visual fixes (tracked separately in P6)
- studio layout/interaction redesign

## Implementation Plan

### Step 1 — Audit current studio tokens

Review:
- `frontend/src/app/studio/[recordingId]/page.tsx`
- `frontend/src/app/studio/[recordingId]/thanks/page.tsx`

Compare their classes against current workspace tokens used by:
- `frontend/src/app/globals.css`
- `frontend/src/components/workspace/*`
- dashboard/project page components

### Step 2 — Align surfaces and typography

Bring studio surfaces closer to the workspace shell:
- background hierarchy
- border opacity
- muted text colors
- radius scale
- button treatment

### Step 3 — Align participant tile styling

Participant tiles should feel like they belong to the same product as:
- dashboard recording cards
- project workspace preview cards

Keep layout behavior intact, but normalize:
- tile chrome
- labels
- status affordances
- badge colors

### Step 4 — Update thanks page

Apply the same visual pass to:
- `frontend/src/app/studio/[recordingId]/thanks/page.tsx`

Goal:
- it should feel like a continuation of the project workspace, not a different app

## Suggested Files To Change

| File | Change |
|------|--------|
| `frontend/src/app/studio/[recordingId]/page.tsx` | Token and visual cleanup only |
| `frontend/src/app/studio/[recordingId]/thanks/page.tsx` | Token and visual cleanup only |

## Verification

1. Start a recording session and compare studio visually to the dashboard shell.
2. Check participant tiles, toolbar, and status badges for consistency.
3. Stop a session and open the thanks page.
4. Confirm all studio functionality still behaves exactly as before.
5. Run:

```bash
cd frontend && npm run typecheck
cd frontend && npm run lint
```
