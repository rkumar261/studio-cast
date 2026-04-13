# P5 — Home Secondary CTA Wiring

**Priority:** MEDIUM  
**Status:** Needs product decision before implementation  
**Effort:** Human ~1 day / CC ~20-30 min

---

## Why This Doc Changed

The older version assumed:
- the home screen should keep a podcast-hosting CTA
- AI cards should deep-link into `/recordings/:id`

Both assumptions are stale.

Current product reality:
- canonical workspace is `/projects/[id]`
- `/recordings` is only an archive
- some premium/podcast language has already been removed from the product
- AI tools and the secondary CTA modules are still mostly decorative

## Current Problem

These home modules are not meaningfully wired:
- `DashboardAiToolsRail`
- `DashboardPodcastCta`

Current issues:
- buttons are decorative or dead-end
- route assumptions are outdated
- messaging may not match the current product direction

## Product Decision Needed First

Before wiring behavior, confirm whether the right-hand analytics CTA should remain:

### Option A — Keep a generic creation CTA

Examples:
- `Create project`
- `Upload media`
- `Open latest project`

### Option B — Keep a podcast/publishing CTA

Only valid if podcast hosting is still a real near-term feature.

### Option C — Replace the entire panel with something else

Examples:
- workspace tips
- recent activity
- upload prompt

## Recommended Direction

For the current product, the safest direction is:
- keep AI tool cards
- replace podcast-specific CTA language with a neutral workspace CTA
- deep-link AI cards into `/projects/[id]`, not `/recordings/[id]`

## AI Tool Wiring Plan

AI tool cards should either:
1. navigate to the latest relevant project section, or
2. be visibly disabled when there is no usable project context

Preferred target model:
- `Transcript` -> `/projects/:id#transcript`
- `Exports` -> `/projects/:id#exports`
- `Captions` -> `/projects/:id#exports`
- `Clips` -> disabled or “coming soon” until clips actually exist

If section anchors are used, the project page should expose matching IDs.

## Secondary CTA Plan

If podcast CTA is removed, recommended replacement actions are:
- `Create project`
- `Upload media`

Both should align to the current projects-first IA:
- `/projects`
- `/projects/new?mode=upload` once P3 lands

## Suggested Files To Change

| File | Change |
|------|--------|
| `frontend/src/components/dashboard/DashboardAiToolsRail.tsx` | Pass actionable/disabled state |
| `frontend/src/components/dashboard/DashboardAiToolCard.tsx` | Support links / disabled state / click affordance |
| `frontend/src/components/dashboard/DashboardPodcastCta.tsx` | Replace with neutral CTA or re-scope copy |
| `frontend/src/lib/dashboard/useHomeViewModel.ts` | Provide latest project / section target data |

## Verification

1. Home dashboard with no projects:
   - AI tool cards show disabled or fallback behavior
   - CTA does not route to dead pages
2. Home dashboard with projects:
   - cards route into `/projects/[id]`
   - CTA routes into a valid project/create/upload path
3. No references remain to `/recordings/:id` in this home CTA flow.
4. Run:

```bash
cd frontend && npm run typecheck
cd frontend && npm run lint
```
