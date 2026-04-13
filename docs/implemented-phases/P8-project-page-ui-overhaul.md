# P8 — Project Page UI Overhaul

**Priority:** HIGH
**Status:** Not started
**Branch:** new branch from main (e.g. `feat/project-page-ui-overhaul`)
**Effort:** Human ~3 days / CC ~45 min

---

## Problems to Fix

1. **Blank thumbnails** — Recording cards on Home and Projects pages show a static beige/grey gradient instead of real video thumbnails.
2. **"Untitled project" names** — Recordings created without an explicit title show "Untitled project" everywhere. Users need to be able to set a title, or the system should auto-generate one.
3. **Cluttered details page** — The project workspace page (`/projects/[id]`) stacks too many sections vertically. It feels crowded and hard to scan. The Riverside reference shows a cleaner flat layout: one clear hero section, then a simple flat track list with "Download" actions, no nested banners cluttering the view.

---

## Reference: What Riverside Does

```
Project page layout (Riverside):
┌─────────────────────────────────────────────────────────────┐
│  ← Projects  /  Raw & RAKESH                    [+ Create]  │
├─────────────────────────────────────────────────────────────┤
│  Recordings  |  Made for You  |  Edits  |  Exports          │  ← tab bar
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────┐                               │
│  │                          │  Created 2 days ago  [···]    │
│  │    Video thumbnail       │                               │
│  │    (real video frame)    │  TRACKS                       │
│  │                          │  ──────────────────────────── │
│  └──────────────────────────┘  👥 All participants  00:45   │
│                                   Ready           Download  │
│                                ──────────────────────────── │
│                                👤 RAKESH KUMAR   00:45      │
│                                   Ready           Download  │
│                                ──────────────────────────── │
│                                👤 Raw Man         00:45     │
│                                   Ready           Download  │
│                                ──────────────────────────── │
│                                💬 Transcript                 │
│                                   Ready       Copy Download │
└─────────────────────────────────────────────────────────────┘
```

Key observations from Riverside:
- Full-width video thumbnail with real video frame
- Flat list: all tracks + transcript in one section, no nested cards
- Status ("Ready") and action ("Download") on the same row
- No processing banner dominating the top
- Tabs are flat, not intrusive
- Breadcrumb navigation at top

---

## Fix 1 — Blank Thumbnails

### Root Cause

`DashboardRecentCard.tsx` line 19 uses a hardcoded CSS gradient for all cards:
```tsx
// CURRENT — always shows beige gradient
<div className="aspect-[1.25/1] bg-[radial-gradient(...)]" />
```

The `RecordingCardViewModel` already has `thumbnailUrl?: string` but it is never populated in `buildProjectRecordingCards()` in `useProjectRecordings.ts`.

The `ListRecordingsResponse` API type also does not include `thumbnailUrl`:
```typescript
// api.ts line 108 — CURRENT
items: Array<{ id: string; title?: string; status: string; createdAt: string }>;
```

### Fix Steps

**Step 1 — Backend: Add thumbnailUrl to list endpoint**

The combined asset's `thumbnailUrl` is already computed in `project-assets.service.ts`. The recordings list endpoint needs to return it.

File: `backend/src/routes/recordings.routes.ts` — the `GET /v1/recordings` handler.

In the Prisma query, join `combined_asset` and return its `thumbnail_key` or `preview_url`. Map it to `thumbnailUrl` in the response.

What to add to the list query:
```typescript
include: {
  combined_asset: {
    where: { kind: 'combined' },
    select: { thumbnail_key: true, preview_url: true },
    take: 1,
    orderBy: { created_at: 'desc' },
  },
  // ...existing includes
}
```

Map to response:
```typescript
thumbnailUrl: recording.combined_asset[0]?.preview_url ?? null,
```

> Note: Check actual field names in `backend/prisma/schema.prisma` — `combined_asset` table column for preview may be `preview_url`, `thumbnail_url`, or `storage_key_final`. Read schema before writing.

**Step 2 — Frontend: Add thumbnailUrl to API type**

File: `frontend/src/lib/api.ts` line 108:
```typescript
// CHANGE TO:
items: Array<{
  id: string;
  title?: string;
  status: string;
  createdAt: string;
  thumbnailUrl?: string;  // ← add this
}>;
```

**Step 3 — Pass thumbnailUrl through view model builder**

File: `frontend/src/lib/projects/useProjectRecordings.ts` line 23:
```typescript
buildRecordingCardViewModel({
  id: item.id,
  title: item.title,
  state: item.status,
  createdAt: item.createdAt,
  thumbnailUrl: item.thumbnailUrl,  // ← add this
  primaryAction: { label: 'Open project', href: `/projects/${item.id}` },
})
```

**Step 4 — Render thumbnail in card**

File: `frontend/src/components/dashboard/DashboardRecentCard.tsx` line 19:
```tsx
// CHANGE FROM:
<div className="aspect-[1.25/1] bg-[radial-gradient(...)]" />

// CHANGE TO:
{card.thumbnailUrl ? (
  <img
    src={card.thumbnailUrl}
    alt={card.title}
    className="aspect-[1.25/1] w-full object-cover transition duration-300 group-hover:scale-[1.02]"
    loading="lazy"
  />
) : (
  <div className="aspect-[1.25/1] bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.16),transparent_22%),linear-gradient(135deg,#c6c0ae,#d8d1bf_45%,#a4a0a0)] transition duration-300 group-hover:scale-[1.02]" />
)}
```

This keeps the gradient as a fallback when no thumbnail is available (draft/processing recordings).

---

## Fix 2 — "Untitled project" Names

### Root Cause

When a recording is created, `title` is optional and often not set. The fallback `'Untitled project'` is applied in `formatRecordingTitle()`. This is correct behavior — the problem is there's no way for the user to set a title.

Two sub-problems:
1. New recordings created from the studio have no title prompt
2. The project detail page has no "rename" affordance

### Fix Steps

**Step 1 — Auto-title from session date**

File: `frontend/src/lib/recording-card-view-model.ts` line 41:
```typescript
// CHANGE FROM:
export function formatRecordingTitle(title?: string | null) {
  const trimmed = title?.trim();
  return trimmed?.length ? trimmed : 'Untitled project';
}

// CHANGE TO:
export function formatRecordingTitle(title?: string | null, createdAt?: string) {
  const trimmed = title?.trim();
  if (trimmed?.length) return trimmed;
  if (createdAt) {
    const d = new Date(createdAt);
    return `Recording — ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }
  return 'Untitled project';
}
```

Update call sites to pass `createdAt`:
- `buildRecordingCardViewModel()` — pass `input.createdAt` to `formatRecordingTitle`
- `useProjectWorkspace.ts` line 132 — pass `recording.createdAt`

**Step 2 — Editable title on project header**

File: `frontend/src/components/projects/ProjectHeader.tsx`

Replace the static title `<h1>` with an inline-editable field:
```tsx
// Clicking the title → shows an <input> in place, blur/Enter saves
// On save: PATCH /v1/recordings/:id with { title: newTitle }
```

Implementation:
```tsx
'use client';
import { useState } from 'react';

// Add to props: onRenameTitle?: (newTitle: string) => Promise<void>

const [editing, setEditing] = useState(false);
const [draft, setDraft] = useState(title);

function handleBlur() {
  setEditing(false);
  if (draft.trim() && draft !== title) {
    void onRenameTitle?.(draft.trim());
  }
}

// Render:
{editing ? (
  <input
    autoFocus
    value={draft}
    onChange={(e) => setDraft(e.target.value)}
    onBlur={handleBlur}
    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    className="text-3xl font-bold text-white bg-transparent border-b border-white/20 outline-none w-full max-w-lg"
  />
) : (
  <h1
    className="text-3xl font-bold text-white cursor-text hover:opacity-80"
    title="Click to rename"
    onClick={() => setEditing(true)}
  >
    {title}
    <span className="ml-2 text-base text-slate-500 font-normal opacity-0 group-hover:opacity-100">✎</span>
  </h1>
)}
```

**Step 3 — Wire rename API**

File: `frontend/src/lib/api.ts` — add:
```typescript
export const RecordingsAPI = {
  // ...existing
  rename: async (id: string, title: string) => {
    const res = await apiFetch(`/v1/recordings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });
    if (!res.ok) throw new Error('Failed to rename');
  },
};
```

**Step 4 — Backend PATCH /v1/recordings/:id**

Check if this endpoint already exists. If not, add to `backend/src/routes/recordings.routes.ts`:
```typescript
fastify.patch('/v1/recordings/:id', { preHandler: [authGuard] }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const { title } = request.body as { title?: string };
  await prisma.recording.update({
    where: { id },
    data: { title: title?.trim() ?? null },
  });
  return reply.send({ ok: true });
});
```

---

## Fix 3 — Project Details Page Redesign

### Current Problems (visible in screenshots)

Looking at the current layout:
- `ProjectProcessingBanner` takes up a large section at the top with nested progress/pending/failed lists — too prominent, should be collapsible or inline
- `ProjectHeroPreview` + `ProjectActionBar` side-by-side grid: the action bar on the right is a separate floating box
- `ProjectRecordingsRail` — "Nearby work" section clutters the page
- `ProjectTracksPanel` and `ProjectArtifactsPanel` are separate sections with their own big headings
- `TranscriptPanel` is a 6th heavy section

Result: 6 sections stacked vertically → page feels like a long scrolling doc, not a clean workspace.

### Target Layout (Riverside-inspired)

```
┌──────────────────────────────────────────────────────────────────┐
│  ← Projects > {Title} [editable]          [All recordings] [···] │  ← header
├──────────────────────────────────────────────────────────────────┤
│  Recordings  |  Tracks  |  Exports  |  Transcript                │  ← tabs (flat)
├──────────────────────────────────────────────────────────────────┤
│  [Processing ▸ 2 items pending]                                  │  ← collapsed banner (1 line)
├────────────────────────────┬─────────────────────────────────────┤
│                            │                                      │
│    Video preview           │  Created Apr 1, 2026  [···]         │
│    (16:9, real frame)      │                                      │
│    or black placeholder    │  TRACKS                              │
│                            │  ──────────────────────────────────  │
│                            │  👥 All participants  00:45  Ready   │
│                            │                            Download  │
│                            │  ──────────────────────────────────  │
│                            │  👤 Rakesh Kumar     00:45  Ready   │
│                            │                            Download  │
│                            │  ──────────────────────────────────  │
│                            │  💬 Transcript               Ready  │
│                            │                       Copy Download  │
└────────────────────────────┴─────────────────────────────────────┘
```

### Redesign Steps

#### Step 3.1 — Collapse the ProcessingBanner to one line

File: `frontend/src/components/projects/ProjectProcessingBanner.tsx`

Change from: full card with pending/failed lists always visible
Change to: a single slim status bar, expandable on click

```tsx
// Slim version:
<div className="flex items-center gap-3 rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-2.5 text-sm">
  <span className="h-2 w-2 rounded-full bg-violet-400 animate-pulse" />
  <span className="text-slate-300">{banner.summary}</span>
  {(banner.pending.length > 0 || banner.failed.length > 0) && (
    <button
      onClick={() => setExpanded(!expanded)}
      className="ml-auto text-xs text-slate-500 hover:text-slate-300"
    >
      {expanded ? 'Hide details' : `${banner.pending.length} pending`}
    </button>
  )}
</div>
// Expanded section: only shown when expanded === true
```

#### Step 3.2 — Redesign the hero + tracks layout (two-column)

File: `frontend/src/app/(authenticated)/projects/[id]/page.tsx`

Change the page structure to:

```tsx
<div className="space-y-6 pb-8">
  {/* Header */}
  <ProjectHeader ... />

  {/* Tabs */}
  <WorkspaceTabs tabs={tabs} />

  {/* Slim processing banner — only shown while processing */}
  {viewModel.processingBanner && (
    <ProjectProcessingBanner banner={viewModel.processingBanner} />
  )}

  {/* Main two-column layout */}
  <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_400px]">
    {/* Left: video preview */}
    <div className="space-y-4">
      <ProjectHeroPreview hero={viewModel.hero} videoRef={previewRef} />
    </div>

    {/* Right: metadata + flat track list */}
    <div className="space-y-6">
      <ProjectMeta
        createdAtLabel={viewModel.createdAtLabel}
        actions={viewModel.hero?.actions ?? []}
        recordingId={viewModel.id}
        onAction={workspace.handleAssetAction}
        onRefresh={workspace.refreshProject}
        busyId={workspace.assetActionBusyId}
      />
      <ProjectFlatTrackList
        tracks={viewModel.tracks}
        artifacts={viewModel.artifacts}
        busyId={workspace.assetActionBusyId}
        onAction={workspace.handleAssetAction}
      />
    </div>
  </div>

  {/* Transcript section — only shown when transcript tab is active or always below */}
  <TranscriptPanel
    recordingId={viewModel.id}
    onSeekToMs={seekPrimaryMediaTo}
    onSavedRevision={() => void workspace.refreshProjectAssets()}
  />
</div>
```

#### Step 3.3 — Create ProjectFlatTrackList component

**Remove:** `ProjectTracksPanel`, `ProjectArtifactsPanel`, `ProjectRecordingsRail` from the main layout.
**Create:** `frontend/src/components/projects/ProjectFlatTrackList.tsx`

This is a single flat list that shows ALL of: tracks, captions, transcript, exports — in one unified section styled like Riverside:

```tsx
// Each row:
// ┌──────────────────────────────────────────────────┐
// │ [icon] Name          Duration   State   Download │
// └──────────────────────────────────────────────────┘

export default function ProjectFlatTrackList({ tracks, artifacts, busyId, onAction }) {
  return (
    <section>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
        Tracks
      </h3>
      <div className="divide-y divide-white/5 rounded-2xl border border-white/6 overflow-hidden">
        {tracks.map((track) => (
          <TrackFlatRow key={track.id} track={track} busyId={busyId} onAction={onAction} />
        ))}
        {artifacts.map((artifact) => (
          <ArtifactFlatRow key={artifact.id} artifact={artifact} busyId={busyId} onAction={onAction} />
        ))}
        {tracks.length === 0 && artifacts.length === 0 && (
          <div className="px-4 py-6 text-sm text-slate-500">
            Outputs will appear here as processing completes.
          </div>
        )}
      </div>
    </section>
  );
}
```

#### Step 3.4 — TrackFlatRow and ArtifactFlatRow

Style each row like Riverside: icon on left, name + metadata in middle, status badge, action button on right.

```tsx
// TrackFlatRow — replaces ProjectTrackRow
function TrackFlatRow({ track, busyId, onAction }) {
  return (
    <div className="flex items-center gap-4 bg-black/5 px-4 py-3 hover:bg-white/[0.02]">
      {/* Icon */}
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] text-sm font-semibold text-slate-300 shrink-0">
        {track.title.charAt(0).toUpperCase()}
      </div>

      {/* Name + meta */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{track.title}</p>
        <p className="text-xs text-slate-500">{track.subtitle}</p>
      </div>

      {/* Duration if available */}
      {track.durationLabel && (
        <span className="text-xs text-slate-500 tabular-nums shrink-0">{track.durationLabel}</span>
      )}

      {/* State badge */}
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] border ${toTrackRowBadgeClass(track.state)}`}>
        {track.stateLabel}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {track.actions.map((action) => (
          <button
            key={action.id}
            disabled={busyId === action.id}
            onClick={() => void onAction(action)}
            className="rounded-lg border border-white/8 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-white/16 hover:text-white disabled:opacity-50"
          >
            {busyId === action.id ? '...' : action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

```tsx
// ArtifactFlatRow — same structure, different icon logic
function ArtifactFlatRow({ artifact, busyId, onAction }) {
  const icon = artifact.kind === 'transcript' ? '📝'
             : artifact.kind === 'captions' ? '💬'
             : '⬇️';
  // Same layout as TrackFlatRow
}
```

#### Step 3.5 — Create ProjectMeta component

**Remove:** `ProjectActionBar` from the right column (or repurpose it).
**Create:** `frontend/src/components/projects/ProjectMeta.tsx`

Shows: creation date, ellipsis menu (…) for rename/delete, and action buttons for refresh:

```tsx
export default function ProjectMeta({ createdAtLabel, actions, ... }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{createdAtLabel}</p>
        {/* ··· menu: rename, delete */}
        <button className="rounded-lg p-1.5 text-slate-500 hover:text-white">···</button>
      </div>
      {/* Primary actions (Open studio, Refresh) */}
      <div className="flex gap-2">
        {actions.map((action) => (
          <button key={action.id} onClick={() => void onAction(action)}
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500">
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

#### Step 3.6 — Remove ProjectRecordingsRail from the main page

The "Nearby recordings" rail adds noise. Remove it from `projects/[id]/page.tsx`. Related recordings can live on the Projects list page instead.

If you want to keep it: move it to a dedicated "Related" section at the very bottom, below TranscriptPanel, with a clear heading. Don't show it if there are no other recordings.

---

## Summary of Files to Create

| File | Purpose |
|------|---------|
| `frontend/src/components/projects/ProjectFlatTrackList.tsx` | Unified flat track+artifact list (Riverside-style) |
| `frontend/src/components/projects/ProjectMeta.tsx` | Date + actions header for right column |

## Summary of Files to Change

| File | Change |
|------|--------|
| `backend/src/routes/recordings.routes.ts` | Add `thumbnailUrl` to list response (join combined_asset) |
| `frontend/src/lib/api.ts` | Add `thumbnailUrl?` to `ListRecordingsResponse.items` |
| `frontend/src/lib/projects/useProjectRecordings.ts` | Pass `thumbnailUrl` to `buildRecordingCardViewModel` |
| `frontend/src/lib/recording-card-view-model.ts` | Pass `createdAt` to `formatRecordingTitle` for smarter fallback |
| `frontend/src/components/dashboard/DashboardRecentCard.tsx` | Render `<img>` when `thumbnailUrl` present, gradient fallback otherwise |
| `frontend/src/components/projects/ProjectHeader.tsx` | Inline-editable title (click to rename) |
| `frontend/src/components/projects/ProjectProcessingBanner.tsx` | Collapse to one-line slim bar, expand on click |
| `frontend/src/app/(authenticated)/projects/[id]/page.tsx` | Restructure layout: hero + flat list in 2-col, remove recordings rail |
| `frontend/src/lib/api.ts` | Add `RecordingsAPI.rename()` PATCH call |
| `backend/src/routes/recordings.routes.ts` | Add `PATCH /v1/recordings/:id` for title rename |

## Files to Remove from Layout (do NOT delete files, just stop importing them on this page)

| Component | Action |
|-----------|--------|
| `ProjectTracksPanel` | Replaced by `ProjectFlatTrackList` |
| `ProjectArtifactsPanel` | Replaced by `ProjectFlatTrackList` |
| `ProjectActionBar` | Replaced by `ProjectMeta` |
| `ProjectRecordingsRail` | Remove from main layout |

Keep the component files — they may be useful elsewhere.

---

## Implementation Order

1. Fix 1 (thumbnails) — backend first (add thumbnailUrl to list), then frontend
2. Fix 2 Step 1 (smarter fallback title) — one-line change, no backend needed
3. Fix 3 (layout overhaul) — create new components, restructure page
4. Fix 2 Steps 2-4 (inline rename) — add after layout is stable

## Verification

1. Home dashboard: recording cards show real video frames (not beige gradient) for completed recordings
2. New recordings default title: shows "Recording — Apr 1, 2026" instead of "Untitled project"
3. Project title is clickable — click → type → blur → title updates
4. Project detail page: left=video, right=flat track list
5. Processing banner is one slim line, expands on click
6. Track list rows: icon + name + duration + status + Download button all on one row
7. Transcript row appears in the same flat list as tracks
8. Run `npm run typecheck` in both `frontend/` and `backend/`
9. Run `npm run lint` in `frontend/`
