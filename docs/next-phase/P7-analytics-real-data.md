# P7 — Analytics Real Data

**Priority:** LOW
**Status:** Not started (shows "Coming soon" badge — acceptable for alpha)
**Effort:** Human ~1 day / CC ~20 min

---

## Problem

`DashboardAnalyticsPanel` shows a "Coming soon" badge because there is no real data. The component is already built to accept optional `data?: AnalyticsSummaryData` prop — when absent, it renders the placeholder state gracefully.

This is NOT blocking anything. The "Coming soon" badge is an acceptable alpha state.

## What Needs to Be Built

### Backend

**New endpoint:** `GET /v1/analytics/summary`

Returns:
```typescript
{
  totalMinutesRecorded: number;  // sum of all recording durations
  episodeCount: number;           // count of recordings not in draft
  lastRecordingAt: string | null; // ISO timestamp of most recent recording
}
```

**New file:** `backend/src/routes/analytics.routes.ts`
```typescript
fastify.get('/v1/analytics/summary', { preHandler: [authGuard] }, async (request, reply) => {
  const userId = request.principal.id;
  const summary = await getAnalyticsSummary(userId);
  return reply.send(summary);
});
```

**New file:** `backend/src/services/analytics.service.ts`
```typescript
export async function getAnalyticsSummary(userId: string): Promise<AnalyticsSummary> {
  const [recordings, lastRecording] = await Promise.all([
    prisma.recording.findMany({
      where: { host_participant: { user_id: userId }, recording_lifecycle_state: { not: 'draft' } },
      select: { duration_ms: true },
    }),
    prisma.recording.findFirst({
      where: { host_participant: { user_id: userId } },
      orderBy: { created_at: 'desc' },
      select: { created_at: true },
    }),
  ]);

  const totalMs = recordings.reduce((sum, r) => sum + (r.duration_ms ?? 0), 0);

  return {
    totalMinutesRecorded: Math.round(totalMs / 60000),
    episodeCount: recordings.length,
    lastRecordingAt: lastRecording?.created_at.toISOString() ?? null,
  };
}
```

**Register in app.ts:**
```typescript
import analyticsRoutes from './routes/analytics.routes.js';
fastify.register(analyticsRoutes);
```

### Frontend

**Add to `frontend/src/lib/api.ts`:**
```typescript
export async function getAnalyticsSummary(): Promise<AnalyticsSummaryData> {
  const res = await apiFetch('/v1/analytics/summary');
  if (!res.ok) throw new Error('Failed to fetch analytics');
  return res.json();
}
```

**Update `useHomeViewModel.ts`** (or equivalent hook):
```typescript
const { data: analytics } = useSWR('analytics-summary', getAnalyticsSummary);
// Pass to DashboardAnalyticsPanel:
// <DashboardAnalyticsPanel data={analytics} />
```

**Update `DashboardAnalyticsPanel.tsx`:**
- Remove "Coming soon" badge when `data` is present
- Show real numbers: total minutes, episode count, last recording date
- Keep badge as fallback when `data` is undefined (loading/error state)

## DB Query Notes

The Prisma schema does not have a `duration_ms` field on `recording` directly — check the actual schema at `backend/prisma/schema.prisma`. If duration is not stored, compute it from `session_ended_at - session_started_at`. If neither exists, use the sum of track durations.

Before implementing: read `backend/prisma/schema.prisma` to confirm field names.

## Files to Create

| File | Purpose |
|------|---------|
| `backend/src/routes/analytics.routes.ts` | New analytics API endpoint |
| `backend/src/services/analytics.service.ts` | DB aggregation queries |

## Files to Change

| File | Change |
|------|--------|
| `backend/src/app.ts` | Register analytics routes |
| `frontend/src/lib/api.ts` | Add `getAnalyticsSummary` |
| `frontend/src/lib/hooks/useHomeViewModel.ts` | Fetch and pass analytics data |
| `frontend/src/components/dashboard/DashboardAnalyticsPanel.tsx` | Remove "Coming soon" when data present |

## Verification

1. Log in and go to home dashboard
2. "Coming soon" badge should be gone — real numbers show
3. Total minutes should match what you'd expect from your test recordings
4. Episode count matches recording list count
5. Last recording timestamp is correct
6. Run `npm run typecheck` in both `backend/` and `frontend/`
