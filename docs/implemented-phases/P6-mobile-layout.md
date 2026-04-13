# P6 — Mobile Layout Refresh

**Priority:** MEDIUM  
**Status:** Needs IA refresh before implementation  
**Depends on:** Current projects-first dashboard/workspace structure  
**Effort:** Human ~2-3 days / CC ~1 hour

---

## Why This Doc Changed

The older mobile doc assumed:
- `Recordings` is a primary destination
- mobile bottom nav should be `Home / Recordings / Upload / Profile`
- project detail might still use the older right-rail layout

Those assumptions are stale.

Current IA:
- `Home` is the dashboard
- `Projects` is primary
- `Project` page is canonical
- `Recordings` is secondary archive
- account is currently handled from the shell avatar/popover

## Current Problems

Below tablet widths:
- the fixed authenticated sidebar is still desktop-heavy
- the project workspace can get long and dense
- account affordances are desktop-oriented
- the dashboard grid and CTA sections are not yet intentionally mobile-designed

## Updated Mobile IA

### Desktop / large tablet

- keep the left workspace rail

### Small tablet

- collapse the rail to icon-first mode

### Mobile

- hide the full left rail
- replace it with a compact bottom navigation or equivalent mobile nav pattern

## Recommended Mobile Nav

Use:
- `Home`
- `Projects`
- `Create` or `Upload`
- `Account`

Do **not** make `Recordings` a primary mobile nav item.
The archive can remain accessible from:
- `Projects`
- a `More` surface
- an account/settings area if needed

## Project Page Mobile Rules

The current project page direction should remain:
1. preview first
2. tracks/artifacts below
3. transcript below that

Do not reintroduce a right-side rail on smaller screens.

### Mobile stacking order

```text
Header
Processing banner
Hero preview
Primary actions
Tracks / artifacts
Transcript
```

## Dashboard Mobile Rules

### Home

- quick actions should remain prominent
- recent cards should become a single-column scroll/list on phones
- analytics and AI tool modules should stack vertically

### Projects index

- card grid should collapse cleanly
- filters/search should stack above the list

### Recordings archive

- remain simple and list-first

## Studio Guidance

Studio is still desktop-first.

This phase may add:
- better responsive spacing
- guardrails/warnings for narrow screens

But it should not attempt a large studio functional redesign.

## Suggested Files To Change

| File | Change |
|------|--------|
| `frontend/src/app/(authenticated)/layout.tsx` | Responsive shell adjustments |
| `frontend/src/components/workspace/WorkspaceSidebar.tsx` | Tablet/mobile nav behavior |
| `frontend/src/app/(authenticated)/page.tsx` and dashboard components | Responsive dashboard stacking |
| `frontend/src/app/(authenticated)/projects/page.tsx` | Responsive project index layout |
| `frontend/src/app/(authenticated)/projects/[id]/page.tsx` | Mobile-safe stacked workspace flow |
| `frontend/src/app/studio/[recordingId]/page.tsx` | Light responsive support only |

## Verification

Test at:
- `375px`
- `768px`
- `1024px`
- `1280px`

Confirm:
1. navigation stays usable
2. project page remains preview -> tracks -> transcript
3. home recents and project cards do not overflow
4. account actions remain reachable on touch devices
5. Run:

```bash
cd frontend && npm run typecheck
cd frontend && npm run lint
```
