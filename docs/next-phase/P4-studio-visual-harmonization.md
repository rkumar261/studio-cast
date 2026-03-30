# P4 — Studio Visual Harmonization

**Priority:** MEDIUM
**Status:** Not started
**Depends on:** Dashboard redesign (feat/project-page-layout) must be shipped
**Effort:** Human ~1 day / CC ~20 min

---

## Problem

The studio page (`/studio/[recordingId]`) was built before the dashboard redesign. It uses older design tokens and layout patterns that don't match the redesigned shell. After the dashboard ships, the studio page will look visually inconsistent.

## Goals

1. Update studio page colors/tokens to match the design system
2. Match header/nav pattern from the authenticated shell
3. Ensure participant video tiles match the recording card visual style
4. Keep all functional behavior unchanged — this is purely visual

## Scope

**In scope:**
- Color token updates (background, surface, border colors)
- Typography scale consistency
- Header/toolbar layout alignment
- Button and badge visual style
- Participant tile card borders/shadows

**Out of scope:**
- Any recording functionality changes
- WebRTC or LiveKit changes
- Layout restructuring (tiles arrangement)
- Mobile responsiveness (tracked in P6)

## Implementation

### Step 1 — Audit current tokens

Read `frontend/src/app/studio/[recordingId]/page.tsx` and note all Tailwind classes that use:
- Background colors (`bg-*`)
- Text colors (`text-*`)
- Border colors (`border-*`)
- Shadow utilities

Compare against the design system tokens used in:
- `frontend/src/components/dashboard/` components
- `frontend/src/app/(authenticated)/layout.tsx`

### Step 2 — Map token replacements

Common replacements expected:

| Old (studio) | New (design system) |
|---|---|
| `bg-gray-900` | `bg-slate-950` |
| `bg-gray-800` | `bg-slate-900` |
| `border-gray-700` | `border-slate-800` |
| `text-gray-300` | `text-slate-300` |
| `text-gray-500` | `text-slate-500` |
| `rounded` | `rounded-xl` (cards) |

### Step 3 — Update studio page layout

The studio page header should use the same `h-14` shell header height and `border-b border-slate-800` divider as the authenticated layout.

Recording status indicator (the red "REC" badge) should use the badge style from the design system.

### Step 4 — Participant tile cards

Each participant video tile should match the `DashboardRecentCard` visual language:
- `bg-slate-900 rounded-xl border border-slate-800`
- Name label: `text-sm font-medium text-slate-200`
- Status indicator: match dot style from recording cards

### Step 5 — Thanks page

Apply the same token pass to `frontend/src/app/studio/[recordingId]/thanks/page.tsx`.

## Files to Change

| File | Change |
|------|--------|
| `frontend/src/app/studio/[recordingId]/page.tsx` | Color/token pass |
| `frontend/src/app/studio/[recordingId]/thanks/page.tsx` | Color/token pass |

## Verification

1. Start a recording session as host + guest
2. Visually compare studio page against dashboard — backgrounds, borders, typography should feel unified
3. Verify all recording functions still work (start, stop, audio/video indicators)
4. Run `npm run typecheck` and `npm run lint` in `frontend/`
