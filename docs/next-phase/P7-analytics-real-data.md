# P7 — Analytics with Real Data

**Priority:** LOW  
**Status:** Not started (placeholder state is acceptable for alpha)  
**Effort:** Human ~1 day / CC ~20-30 min

---

## Why This Doc Changed

The older version assumed a simple backend query shape and an outdated frontend hook path.

Current reality:
- `DashboardAnalyticsPanel` already accepts optional `data`
- `useHomeViewModel()` currently fabricates analytics from recent cards
- the backend schema includes usable duration data, but it needs to be sourced carefully

## Current Problem

Home analytics is not real yet.

Current behavior in `frontend/src/lib/dashboard/useHomeViewModel.ts`:
- `episodeCount` is derived from visible recent cards
- `totalMinutesRecorded` is fabricated
- `lastRecordingAt` is derived from the first recent card label

That is acceptable as placeholder behavior, but not correct.

## Goal

Replace fake home analytics with a real backend summary endpoint while keeping the current graceful fallback behavior.

## Current Frontend Support

`DashboardAnalyticsPanel` already behaves correctly when `data` is missing:
- it renders the metrics card
- it shows a `Coming soon` badge when no real data is present

So the missing work is mostly data sourcing and plumbing.

## Recommended Backend Shape

Add:

```text
GET /v1/analytics/summary
```

Suggested response:

```ts
{
  totalMinutesRecorded: number;
  projectCount: number;
  lastRecordingAt: string | null;
}
```

Use `projectCount` or `recordingCount` consistently with the dashboard wording you want to keep.

## Data Source Guidance

Do not assume every useful metric lives directly on `recording`.

Before implementing, verify current schema and data availability in:
- `backend/prisma/schema.prisma`
- `backend/src/services/recordings.service.ts`
- `backend/src/services/project-assets.service.ts`

Recommended data strategy:
- count non-draft recordings/projects owned by the current user
- compute total duration from the best available asset-level duration
  - prefer `combined_asset.duration_ms` when available
  - fall back carefully if combined asset is absent
- use the most recent `created_at` as `lastRecordingAt`

## Implementation Plan

### Step 1 — Add backend summary endpoint

Suggested files:
- `backend/src/routes/analytics.routes.ts`
- `backend/src/services/analytics.service.ts`

Register the route in the backend app bootstrap.

### Step 2 — Add frontend API wrapper

Add a small wrapper in:
- `frontend/src/lib/api.ts`

### Step 3 — Replace fake home analytics

Update:
- `frontend/src/lib/dashboard/useHomeViewModel.ts`

Behavior:
- fetch analytics summary
- pass real data into `DashboardAnalyticsPanel`
- keep current fallback UI if the fetch fails or data is missing

### Step 4 — Keep panel copy aligned with the real metric

If the panel still says `Total streams` but the backend returns project/recording metrics, decide whether to rename the UI copy.

The metric label should match what is actually being counted.

## Suggested Files To Change

| File | Change |
|------|--------|
| `backend/src/routes/analytics.routes.ts` | New summary endpoint |
| `backend/src/services/analytics.service.ts` | Aggregate query logic |
| `backend/src/app.ts` or equivalent bootstrap | Register route |
| `frontend/src/lib/api.ts` | Add analytics summary fetch |
| `frontend/src/lib/dashboard/useHomeViewModel.ts` | Replace fake analytics data |
| `frontend/src/components/dashboard/DashboardAnalyticsPanel.tsx` | Minor copy cleanup if needed |

## Verification

1. Log in and open the home dashboard.
2. Confirm the `Coming soon` badge disappears when real data is returned.
3. Validate:
   - total minutes against real recordings/assets
   - count against the current project/recording model
   - most recent recording date
4. Force a failing analytics request and confirm the panel still renders its placeholder fallback.
5. Run:

```bash
cd backend && npm run build
cd frontend && npm run typecheck
cd frontend && npm run lint
```
