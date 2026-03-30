# P6 — Mobile Layout

**Priority:** MEDIUM
**Status:** Not started
**Depends on:** Dashboard redesign (feat/project-page-layout) must be shipped
**Effort:** Human ~3 days / CC ~1 hour

---

## Problem

The current dashboard and studio are built desktop-first. Below tablet breakpoints:
- Dashboard sidebar may overflow or collapse badly
- Recording cards grid goes single-column but may not have correct spacing
- Studio participant tiles are not responsive
- The analytics panel overflows horizontally

## Target Breakpoints

| Breakpoint | Target | Notes |
|------------|--------|-------|
| `xl` (1280px+) | Full two-column dashboard | Sidebar + main |
| `lg` (1024px+) | Full dashboard, smaller sidebar | |
| `md` (768px+) | Tablet — sidebar collapses to icon-only | |
| `sm` (640px-) | Mobile — no sidebar, bottom nav | |

## Dashboard Mobile Layout

### Navigation

**Desktop (≥md):** Left sidebar with icon + label
**Mobile (<md):** Bottom navigation bar with 4 icons (Home, Recordings, Upload, Profile)

```
Mobile bottom nav:
┌────────────────────────────────┐
│  🏠 Home  📼 Rec  ⬆ Upload  👤  │
└────────────────────────────────┘
```

### Dashboard Grid

| Breakpoint | Layout |
|------------|--------|
| xl | 2-col: main content + analytics sidebar |
| lg-md | Single column, analytics below main |
| sm | Single column, analytics panel hidden (show "Stats" button) |

### Recording Cards Grid

```typescript
// Current
className="grid grid-cols-3 gap-4"

// Mobile-responsive
className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
```

### Quick Actions

On mobile, Quick Actions should scroll horizontally rather than wrap:
```typescript
className="flex gap-3 overflow-x-auto pb-2 scrollbar-none"
```

## Studio Mobile Layout

The studio page is inherently desktop-focused (WebRTC recording). On mobile:
- Show a "Best experienced on desktop" banner below tablet
- Still allow joining as guest on mobile (view only, audio recording)
- Participant tiles: stack vertically on mobile instead of side-by-side

```typescript
// Participant tiles
className="flex flex-col md:flex-row gap-4"
```

## Implementation Steps

### Step 1 — Sidebar collapse (tablet)

In the authenticated layout sidebar, add tablet breakpoint behavior:
- `md`: icon-only sidebar (48px wide, tooltips on hover)
- `sm`: hide sidebar entirely

```typescript
// Sidebar width
className="hidden md:flex w-12 lg:w-64 flex-col ..."
```

### Step 2 — Bottom nav (mobile)

Create `frontend/src/components/layout/MobileBottomNav.tsx`:
```typescript
// Shows only on sm breakpoint
// Links: Home, Recordings, Upload, Profile
className="fixed bottom-0 left-0 right-0 md:hidden ..."
```

### Step 3 — Responsive grids

Update each dashboard component's grid class:
- `DashboardRecentGrid`: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
- Analytics panel: move below main on mobile, hide on xs

### Step 4 — Studio mobile warning

In studio page, add a banner for mobile users:
```typescript
{isMobileBreakpoint && (
  <div className="bg-amber-900/20 border border-amber-700 text-amber-300 px-4 py-2 text-sm">
    Studio recording works best on desktop. Mobile is limited to audio-only.
  </div>
)}
```

## Files to Create

| File | Purpose |
|------|---------|
| `frontend/src/components/layout/MobileBottomNav.tsx` | Mobile bottom navigation |

## Files to Change

| File | Change |
|------|--------|
| `frontend/src/app/(authenticated)/layout.tsx` | Sidebar collapse at md, hide at sm |
| `frontend/src/components/dashboard/DashboardRecentGrid.tsx` | Responsive grid cols |
| `frontend/src/components/dashboard/DashboardQuickActions.tsx` | Horizontal scroll on mobile |
| `frontend/src/components/dashboard/DashboardAnalyticsPanel.tsx` | Stack vertically on mobile |
| `frontend/src/app/studio/[recordingId]/page.tsx` | Vertical tile stack + mobile warning |

## Verification

1. Open Chrome DevTools → set viewport to 375px (iPhone)
2. Dashboard: bottom nav visible, sidebar hidden, cards single-column
3. Set viewport to 768px (iPad): sidebar shows icon-only, cards 2-column
4. Set viewport to 1280px: full layout as designed
5. Studio page on 375px: vertical tile stack, mobile warning banner visible
6. Run `npm run typecheck` and `npm run lint` in `frontend/`
