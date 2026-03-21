# BRD-11: Bug Backlog + Track Readiness Plan
**Branch:** feat/fix-tracks-merging-issues
**Reviewed:** 2026-03-21
**Status:** Approved for implementation

---

## Problem Summary

After 5+ sessions of fixes, three categories of work remain:

1. **Uncommitted fixes** — all fixes to date must ship first
2. **Studio UX bugs** — upload modal + people panel state errors
3. **Track readiness latency** — 3–10 min pipeline delay; users wait too long to see output

---

## Current Processing Pipeline

```
Browser chunks → TUS upload → track_chunk rows
                                     │
                              stitch.worker  ← polls every 1500ms
                              ffmpeg concat → storage_key_raw
                                     │
                              transcode.worker  ← polls every 1500ms
                              ffmpeg encode → storage_key_final
                                     │
                              asr.worker  ← polls every 1500ms
                              dummy transcript
                                     │
                              export.worker  ← polls every 1500ms
                              WAV + MP4 → export_artifact
                                     │
                              reconcileRecordingReadiness() [inline]
                              combined_asset composition
                                     │
                              recording.status = ready
                                     │
                              frontend polls /progress  ← every 3–5s
                              UI updates
```

**Bottlenecks:**
- 5 worker hops × 1500ms poll = 7.5s overhead from polling alone (before ffmpeg)
- Frontend poll interval adds additional delay on top
- No mechanism to show content to user before full pipeline completes
- Race condition: concurrent audio+video transcode completion both call
  `reconcileRecordingReadiness`, can double-trigger `runCombinedComposition`

---

## Implementation Plan (3 PRs)

---

### PR 1 — Ship Existing Fixes (DO FIRST)

**Goal:** Commit all work from the last 4-5 sessions. No new code.

**Changed files (already modified):**
- `backend/src/services/recording-readiness.service.ts` — removed `mp4_captions` from REQUIRED_EXPORT_TYPES
- `backend/src/workers/combined.runner.ts` — audio mixing via `runFfmpegMergeAudio`
- `backend/src/services/combined-asset.service.ts` — audio track query + fingerprint
- `backend/.env` — R2 public URL updated
- `frontend/src/app/recordings/[id]/page.tsx` — duplicate React key fix

**Effort:** /ship only. ~5 min.

---

### PR 2 — Studio UX Bugs

**Goal:** Fix upload modal disappear + people panel wrong states.

#### Bug A: Upload Modal Disappears Before Click

**Root cause:** Modal is conditionally rendered based on upload queue draining.
When queue hits 0, modal unmounts before user can read/click.

**Fix:** Add completion dwell — keep modal visible for 2s after `completed` state,
or require explicit dismiss.

**Files:**
- `frontend/src/components/studio/UploadStatusModal.tsx`

**Implementation:**
```typescript
// Add: hold modal open 2s after all uploads complete
const [showCompletionDwell, setShowCompletionDwell] = useState(false);

useEffect(() => {
  if (isComplete && !showCompletionDwell) {
    setShowCompletionDwell(true);
    const t = setTimeout(() => setShowCompletionDwell(false), 2000);
    return () => clearTimeout(t);
  }
}, [isComplete]);

// Render: show if uploading OR in dwell period
const shouldShow = isUploading || showCompletionDwell;
```

---

#### Bug B: People Panel Wrong States During Live Recording

**Root cause (3 sub-bugs):**

**B1 — Invited-not-joined guests show "Recording..."**
`recording-progress.service.ts:202` sets `state = 'recording'` for ALL participants
when `!recording.stopped_at`, even participants with no tracks who never joined.

**Fix:** Participants with zero tracks AND no active LiveKit connection should show
as "Invited" or be hidden. Use track existence as a proxy for "has joined and recording".

```typescript
// In recording-progress.service.ts
const isStillRecording = !recording.stopped_at;
const hasActiveTracks = participant.track.length > 0;

let state: ConsumerRecordingState;
if (isStillRecording && hasActiveTracks) {
  state = 'recording';
} else if (isStillRecording && !hasActiveTracks) {
  state = 'invited';  // or filter them out entirely
} else if (hasFinalizeIssue) {
  state = 'action required';
} ...
```

**B2 — Disconnected guests stay visible after first backend poll**
After first poll, `remoteProgressParticipants` (backend, DB) replaces `active.peers`
(LiveKit, live connection). Disconnected guests stay in DB → ghost in panel.

**Fix:** Intersect backend participants with LiveKit peers for presence:
```typescript
// studio/page.tsx ~line 2500
const liveParticipantIds = new Set(active.peers.map(p => p.id));
const remoteProgressParticipants = progressParticipants.filter(
  (p) => p.participantId !== localParticipantId
    && (isRecording ? liveParticipantIds.has(p.participantId) : true)
);
```
Only filter by live presence during recording; after stop, show all for upload progress.

**B3 — Potential local participant duplication**
If `recorderParticipantId` is null, `localParticipantId` is undefined → host appears
in both local slot and remote list.

**Fix:** Guard the filter:
```typescript
const remoteProgressParticipants = progressParticipants.filter(
  (p) => localParticipantId ? p.participantId !== localParticipantId : p.role !== 'host'
);
```

**Files:**
- `backend/src/services/recording-progress.service.ts` (B1)
- `frontend/src/app/studio/[recordingId]/page.tsx` (B2, B3)

**Also add `'invited'` to `ConsumerRecordingState` type:**
- `frontend/src/lib/api.ts` (or wherever the type lives)
- `backend/src/dto/recordings/progress.dto.ts`

---

### PR 3 — Track Readiness (High Impact)

**Goal:** Reduce time-to-content from 3–10 min to under 30s for typical recordings.

#### Change A: Reduce Worker Poll Interval (30 min effort, 5× latency improvement)

Drop all worker poll intervals from 1500ms → 300ms.

**Files:** 5 worker files
- `backend/src/workers/stitch.worker.ts` — `POLL_MS = 300`
- `backend/src/workers/transcode.worker.ts` — `POLL_MS = 300`
- `backend/src/workers/asr.worker.ts` — `POLL_MS = 300`
- `backend/src/workers/export.worker.ts` — `POLL_MS = 300`
- `backend/src/workers/maintenance.worker.ts` — keep at 60s (maintenance is coarse)

**Risk:** Slightly higher DB load (SELECT every 300ms × 4 workers = ~13 queries/sec).
Negligible at alpha scale with single-digit active recordings.

#### Change B: Frontend Progress Poll Faster During Processing

Current frontend poll interval for `/progress` is likely 3–5s. Drop to 1s while
`projectState === 'processing'`, back to 5s when `ready`.

**Files:**
- `frontend/src/app/studio/[recordingId]/page.tsx` (or wherever `useInterval` / `setInterval` calls `/progress`)
- `frontend/src/app/recordings/[id]/page.tsx` (project detail page)

#### Change C: Fix `reconcileRecordingReadiness` Race Condition

When audio and video tracks finish transcoding concurrently, both call
`reconcileRecordingReadiness` → both call `reconcileCombinedAssetForRecording` →
both see `state='pending'` → both run `runCombinedComposition` → double upload.

**Fix:** Add a DB-level advisory lock or make the combined asset upsert idempotent
via a `processing` state guard:

```typescript
// In reconcileCombinedAssetForRecording:
// Atomic transition: pending → processing (only one wins)
const claimed = await prisma.combined_asset.updateMany({
  where: { recording_id: args.recordingId, state: { in: ['pending'] } },
  data: { state: 'processing', processing_started_at: new Date() },
});
if (claimed.count === 0) {
  // Another worker already claimed it
  return { code: 'skipped', reason: 'already_processing' };
}
// Then run composition...
```

**Files:**
- `backend/src/services/combined-asset.service.ts`

#### Change D: Show Raw Track in Player Before Processing (Biggest UX Win)

While processing is in flight, serve the raw uploaded track URL directly in the
project detail page player. No pipeline change required.

**How:** The track model has `storage_key_raw` after stitch completes. Expose it
via the progress API or project-assets API. Frontend shows it in the player with
a "Preview (processing...)" label until `storage_key_final` is available.

```
User stops recording
       │
       ├── Immediately: raw WebM chunks visible in R2 (storage_key_raw)
       │   → Show in player as "Preview" with processing indicator
       │
       └── After pipeline: storage_key_final MP4 with audio
           → Upgrade player src, show "Ready"
```

**Files:**
- `backend/src/routes/recordings.routes.ts` — expose `storageKeyRaw` in project-assets response
- `frontend/src/app/recordings/[id]/page.tsx` — use raw URL when final not available

**Note:** Raw format is WebM (from MediaRecorder). Chrome/Safari play WebM natively.
Firefox too. No transcoding needed for preview — browser plays it directly.

---

## Race Condition Detail (Architecture Finding)

```
Time 0ms:  audio transcode finishes → calls reconcileRecordingReadiness()
Time 0ms:  video transcode finishes → calls reconcileRecordingReadiness()
                    │                              │
           reconcileCombined()           reconcileCombined()
                    │                              │
           finds combined=pending        finds combined=pending
                    │                              │
           runCombinedComposition()     runCombinedComposition()
                    │                              │
           uploads all-participants.mp4  uploads all-participants.mp4 (DUPLICATE)
```

This is a real bug but silent — second upload overwrites first with identical content.
The `updateMany` fix makes it explicit and safe.

---

## NOT In Scope (Explicitly Deferred)

| Item | Reason |
|------|--------|
| Real ASR / speech-to-text | External API integration, separate BRD |
| `mp4_captions` export | Depends on real ASR |
| SSE/WebSocket push from backend | Over-engineered for alpha; polling at 300ms is fine |
| S3 multipart resumable uploads | Already in TODOS.md from BRD-10 |
| Multi-participant audio mixing (>1 guest) | Only tested with host-only recordings |
| R2 CORS startup validation | Already in TODOS.md from BRD-10 |
| Automated test suite for workers | Significant effort; manual QA acceptable at alpha |

---

## What Already Exists (Reuse Opportunities)

| Sub-problem | Existing code | Plan reuses? |
|-------------|--------------|--------------|
| Poll interval constant | Each worker has `const POLL_MS = 1500` | Yes — simple constant change |
| Progress polling | Frontend already polls `/progress` | Yes — just change interval |
| Raw storage key | `track.storage_key_raw` already in DB | Yes — just expose via API |
| Combined asset upsert | `prisma.combined_asset.upsert` exists | Modify to `updateMany` guard |
| Participant state | `recording-progress.service.ts` already per-participant | Yes — add track existence check |

---

## Failure Modes

| Codepath | Realistic failure | Test? | Handler? | Silent? |
|----------|-----------------|-------|----------|---------|
| Audio merge in combined runner | WAV not in R2 → download fails | No | Throws, job retries | No |
| Poll interval 300ms | DB overload at scale | No | None (acceptable at alpha) | Yes |
| Race: double combined composition | Both workers compose simultaneously | No | Fixed by `updateMany` guard | Was silent |
| Raw track preview | `storage_key_raw` null if stitch not done | No | Show spinner | No |
| People panel B3 (duplication) | `localParticipantId` null → host shown twice | No | Filter by role fallback | No |

**Critical gaps (no test AND no handler AND silent):**
- Race condition on `runCombinedComposition` (fixed by PR 3 Change C, but no test)

---

## Effort Summary

| PR | Changes | Human estimate | CC+gstack estimate |
|----|---------|---------------|-------------------|
| PR 1 — Ship existing | `/ship` only | 30 min | 5 min |
| PR 2 — UX bugs | 3–4 files | 1 day | 20 min |
| PR 3 — Track readiness | 6–7 files | 2–3 days | 45 min |

---

## Test Plan

### PR 2 Verification
- [ ] Record a session, stop — upload modal stays visible for 2s after completion
- [ ] Invite a guest URL but don't open it — host people panel should NOT show ghost guest as "Recording..."
- [ ] Connect a guest, then disconnect mid-session — guest should disappear from panel within next poll
- [ ] Verify host appears exactly once in the people panel

### PR 3 Verification
- [ ] Record a 10s session, stop — combined asset should appear within 10s (not 3+ min)
- [ ] Project detail page shows raw WebM preview within seconds of stop (before MP4 export)
- [ ] Preview upgrades to final MP4 (with audio) when pipeline completes
- [ ] Stop two recordings simultaneously — both process independently without interference
