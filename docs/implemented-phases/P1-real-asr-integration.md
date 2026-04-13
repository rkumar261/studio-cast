# P1 — ASR Hardening and Transcript Backfill

**Priority:** HIGH  
**Status:** In progress  
**Blocks:** Transcript quality, captions quality, confidence in transcript UX  
**Effort:** Human ~1-2 days / CC ~30 min

---

## Why This Doc Changed

This phase is no longer a fresh “real ASR integration” task.

`backend/src/services/asr.service.ts` already:
- downloads source media from storage
- sends audio to OpenAI Whisper
- chunks large files with `ffmpeg`
- maps Whisper segments into the existing transcript flow

The remaining problems are:
- older recordings may still contain placeholder transcript content
- transcript text still needs cleanup / QA hardening
- ASR error handling is light
- captions/transcript output still needs validation against real recordings

## Current Implementation State

Current live ASR path:

```text
asr.worker.ts
  -> claims job
  -> calls runAsrForTrack() in backend/src/services/asr.service.ts
  -> publishes transcript revision
  -> marks job done
```

Current `runAsrForTrack()` already:
- uses `OPENAI_API_KEY`
- transcribes with `whisper-1`
- splits large media into 10-minute chunks
- offsets timestamps after chunk transcription
- returns normalized `AsrSegment[]`

## Problems Still Visible in the Product

1. Some project pages still show transcript text that looks internal or placeholder-like.
2. There is no explicit legacy-data backfill for transcripts generated before Whisper was wired up.
3. Retry/backoff behavior around OpenAI/API failures is still light.
4. There is no formal transcript-quality validation pass before downstream UX depends on the content.

## Goals

1. Keep the current Whisper-based implementation.
2. Improve resilience and transcript cleanliness.
3. Backfill or regenerate obviously bad/legacy transcript revisions.
4. Validate that transcript + caption consumers receive human-readable text.

## Non-Goals

- Do not replace Whisper with another provider in this phase.
- Do not add speaker diarization in this phase.
- Do not redesign the frontend transcript editor in this phase.

## Phase Breakdown

### Step 1 — Audit current transcript quality

Review current project transcript output in the UI and DB for:
- placeholder strings like `Transcript segment ...`
- internal storage key leakage
- empty or near-empty transcripts
- timestamp ordering issues

Target files to inspect:
- `backend/src/services/asr.service.ts`
- `backend/src/services/transcript-asset.service.ts`
- `frontend/src/app/(authenticated)/projects/[id]/page.tsx`

### Step 2 — Harden ASR execution

Keep the existing `runAsrForTrack()` shape, but improve:
- retry/backoff for OpenAI failures / rate limits
- clearer logging for chunk failures
- explicit handling for silent/no-speech files
- guardrails when `durationMs` is missing or inaccurate

Primary file:
- `backend/src/services/asr.service.ts`

Secondary files only if needed:
- `backend/src/workers/asr.worker.ts`

### Step 3 — Normalize transcript text

Add cleanup rules before publishing transcript revisions:
- trim whitespace
- drop empty/noise-only segments
- avoid leaking file paths or storage keys into UI text
- optionally merge extremely short adjacent segments when Whisper produces noisy fragmentation

This should happen before the transcript revision is published, not as a frontend-only fix.

### Step 4 — Legacy transcript backfill

Create a one-off tool or maintenance path to re-run ASR for recordings whose current transcript output is clearly legacy or placeholder-based.

Recommended output:
- a backend tool under `backend/src/tools/`
- inputs: recording ID list or “scan all suspicious transcripts”
- behavior: enqueue or directly regenerate transcript revisions

### Step 5 — Validate downstream consumers

After hardening:
- transcript editor should show readable language
- captioned-video paths should consume real text when captions are generated
- project page transcript panel should not expose storage-key style content

## Suggested Files To Touch

| File | Change |
|------|--------|
| `backend/src/services/asr.service.ts` | Retry/backoff, cleanup, normalization improvements |
| `backend/src/workers/asr.worker.ts` | Only if worker retry/error surfacing needs adjustment |
| `backend/src/tools/*` | Backfill / transcript regeneration helper |

## Verification

1. Use a real two-speaker or single-speaker recording with clear speech.
2. Let the ASR worker process it end-to-end.
3. Open `/projects/[id]` and confirm transcript text is readable and human-looking.
4. Confirm captions/transcript consumers are using real text, not placeholder text.
5. Run:

```bash
cd backend && npm run build
```

Optional runtime validation:

```bash
cd backend && npm run dev:worker:asr
```

## Follow-Up (Future Phase, Not This One)

- Speaker diarization
- Better transcript punctuation tuning
- Multi-language transcription controls
- Provider abstraction if Whisper needs to be replaced later
