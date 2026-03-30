# P5 — AI Tools / Podcast CTA Backend Wiring

**Priority:** MEDIUM
**Status:** Not started
**Effort:** Human ~1 day / CC ~20 min

---

## Problem

The dashboard has two decorative components that are currently static/non-functional:
- `DashboardAiToolsRail` — shows AI tool cards (clip generation, transcript editing, etc.)
- `DashboardPodcastCta` — shows a "Start your podcast" call-to-action inside the analytics panel

Both are visual placeholders. Clicking them either does nothing or links to dead routes.

## Goals

1. Wire `DashboardPodcastCta` to the "New Recording" flow
2. Wire `DashboardAiToolCard` items to their respective feature pages (clips, transcript, exports)
3. No new backend work needed — all these features already exist, they just need correct links

## AI Tools Rail — Link Map

| Tool Card | Target Route |
|-----------|-------------|
| "Transcript" | `/recordings/:id` → transcript tab |
| "Clips" | `/recordings/:id` → clips section |
| "Export" | `/recordings/:id` → exports section |
| "Captions" | `/recordings/:id` → exports → mp4_captions |

Since the rail is on the home dashboard (no specific recording selected), these should either:
- Link to the most recent recording that has the relevant feature available, OR
- Show a tooltip/modal saying "Select a recording first"

**Recommended:** Show a `"Select a recording to use this tool"` tooltip on hover/click, and disable the card visually if no recordings exist.

## Podcast CTA — Implementation

File: `frontend/src/components/dashboard/DashboardPodcastCta.tsx`

Change the CTA button to navigate to create a new recording:
```typescript
import { useRouter } from 'next/navigation';

const router = useRouter();

// CTA button:
<button onClick={() => router.push('/recordings/new')}>
  Start recording
</button>
```

If `/recordings/new` without `?mode=upload` shows the "New Recording" form (P3 creates this page), this route doubles as the podcast start flow.

## AI Tools Rail — Implementation

File: `frontend/src/components/dashboard/DashboardAiToolsRail.tsx`
File: `frontend/src/components/dashboard/DashboardAiToolCard.tsx`

Update `DashboardAiToolCard` to accept:
```typescript
type DashboardAiToolCardProps = {
  title: string;
  description: string;
  icon: React.ReactNode;
  href?: string;          // direct link if recording context available
  disabled?: boolean;     // grayed out when no recordings exist
  disabledTooltip?: string;
};
```

In `DashboardAiToolsRail`, pass `disabled={recordingCount === 0}` and `disabledTooltip="Create a recording first"`.

When `href` is set and not disabled, clicking navigates. When disabled, clicking shows the tooltip.

## Data Needed

`DashboardAiToolsRail` needs to know:
- Does the user have any recordings? (to decide disabled state)
- What is the most recent recording ID? (for deep links)

This data is already fetched by `useHomeViewModel` (or equivalent). Pass it down as props.

## Files to Change

| File | Change |
|------|--------|
| `frontend/src/components/dashboard/DashboardPodcastCta.tsx` | Wire CTA button to `/recordings/new` |
| `frontend/src/components/dashboard/DashboardAiToolCard.tsx` | Add `href`, `disabled`, `disabledTooltip` props |
| `frontend/src/components/dashboard/DashboardAiToolsRail.tsx` | Pass recording count/id from view model |

## Files to Read First

Before implementing, read:
- `frontend/src/components/dashboard/DashboardAiToolsRail.tsx` — understand current structure
- `frontend/src/components/dashboard/DashboardAiToolCard.tsx` — understand current props
- `frontend/src/components/dashboard/DashboardPodcastCta.tsx` — understand current CTA

## Verification

1. Home dashboard with no recordings: AI tool cards show disabled state with tooltip
2. Home dashboard with recordings: AI tool cards link to correct sections
3. Podcast CTA button navigates to `/recordings/new`
4. Run `npm run typecheck` and `npm run lint` in `frontend/`
