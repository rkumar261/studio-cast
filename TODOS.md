# TODOS

## Deferred from BRD-10 (feat/tus-removal-presigned-url)

### True resumable chunk uploads (S3 multipart)
**What:** Replace single presigned PUT per chunk with S3 multipart upload (CreateMultipartUpload → UploadPart presigned URLs → CompleteMultipartUpload), enabling byte-range resuming on failure.

**Why:** Current presigned PUT re-uploads the full chunk on any failure. For poor connections or large chunks (>10MB), this wastes bandwidth and increases recording failure rate.

**Pros:** True resume-from-byte, finer upload progress granularity, better resilience on mobile/unstable networks.

**Cons:** Significant protocol complexity — backend must manage UploadId lifecycle, frontend must split blobs into parts, cleanup requires AbortMultipartUpload on failure. 3x the surface area of the current PUT flow.

**Context:** The current presigned PUT approach was chosen for simplicity. Chunks are typically 1-10MB (5-30s WebM). Full re-upload is acceptable for v1. Implement if support reports upload failure rates >5% on typical recording sessions.

**Depends on:** BRD-10 presigned URL flow must be live and stable first.

---

### R2 CORS validation at server startup
**What:** Add a startup check that verifies the R2 bucket has CORS configured to allow PUT from the configured frontend origin.

**Why:** CORS misconfiguration causes every chunk upload to silently fail (browser TypeError), which looks identical to a network outage. Currently caught only by documentation.

**Pros:** Fast-fail on misconfiguration, clear error message, eliminates a class of "uploads not working" support tickets.

**Cons:** Requires a preflight/HEAD request to R2 on every server start. Minor startup latency (~100ms). R2 CORS API may require additional permissions.

**Context:** R2 CORS is documented in .env.example and CLAUDE.md as of BRD-10. The frontend wraps fetch TypeError with a console.error hint. This TODO upgrades from "hint" to "hard startup gate".

**Depends on:** BRD-10 presigned URL flow must be live.

---

## Deferred from BRD-11 (feat/fix-tracks-merging-issues)

### Real ASR / speech-to-text integration
**What:** Replace the dummy `runAsrForTrack` in `asr.service.ts` with a real speech-to-text provider (Whisper, Deepgram, AssemblyAI, etc.).

**Why:** The current dummy ASR generates placeholder text ("Transcript segment N from participant recording..."). The transcript feature is non-functional. The `mp4_captions` export always fails because the dummy produces 0 publishable segments. Both block product value.

**Pros:** Unlocks real transcript, search, captions. Enables `mp4_captions` export. Differentiating feature for a recording platform.

**Cons:** External API dependency + cost. Requires audio extraction from track before sending. Privacy/retention policy for audio sent to third party. Need to handle long recordings in chunks (Whisper max ~25MB per request).

**Context:** ASR worker infra is complete — job queue, transcript revision lifecycle, `publishTranscriptRevision` all work. Only `runAsrForTrack` is a stub. Drop-in: implement the function, keep the same return type `{ segments: AsrSegment[] }`. Whisper via OpenAI API is the simplest path. Deepgram has better streaming/real-time options for future. See `backend/src/services/asr.service.ts`.

**Depends on:** Nothing blocked. Can implement independently.

---

### `reconcileRecordingReadiness` race condition on concurrent transcodes
**What:** When audio and video tracks finish transcoding at the same time, two workers both call `reconcileRecordingReadiness` → both call `reconcileCombinedAssetForRecording` → both see `state='pending'` → both run `runCombinedComposition` → two concurrent R2 uploads of the same file.

**Why:** Currently silent — second upload overwrites with identical content. No user-visible error. But it wastes R2 bandwidth and could cause subtle ordering bugs if the combined asset is updated between the two composition calls.

**Pros:** Eliminates double-upload, makes pipeline deterministic, adds a clean idempotency guard.

**Cons:** Small change (~10 lines in `combined-asset.service.ts`) but needs careful testing — the `updateMany` guard must not block legitimate re-compositions (e.g. after a source asset changes).

**Context:** Fix is: replace the fingerprint-equality early-return with an atomic `updateMany({ where: { state: 'pending' } })` that only one worker wins. The loser returns `skipped`. See `backend/src/services/combined-asset.service.ts` around `reconcileCombinedAssetForRecording`. Plan doc: `docs/PLAN_BRD11_BUG_BACKLOG.md`.

**Depends on:** Nothing blocked.

---

### Raw track preview before pipeline completes
**What:** Show the raw uploaded WebM track in the project detail page player immediately after the stitch worker finishes (before transcode/export completes). Label it "Preview (processing...)" and upgrade to the final MP4 when the pipeline completes.

**Why:** Currently users wait 3–10 minutes after stopping a recording before seeing any content. Riverside shows content "instantly" because they display client-side recording blobs. Our server-side equivalent is `storage_key_raw` which is available after stitch (~30s).

**Pros:** Massive UX improvement — users see their content within ~30s of stopping. No pipeline change needed. WebM plays natively in Chrome/Firefox/Safari.

**Cons:** Raw WebM from MediaRecorder has no audio if video and audio were recorded as separate tracks (current setup). Preview is video-only. Also requires exposing `storage_key_raw` via the project-assets API response.

**Context:** The track model already has `storage_key_raw` populated after stitch. Need to: (1) add it to the project-assets API response in `recordings.routes.ts`, (2) generate a presigned GET URL for it, (3) show it in the player in `frontend/src/app/recordings/[id]/page.tsx` when `storageKeyFinal` is not yet available. See `docs/PLAN_BRD11_BUG_BACKLOG.md` for full plan.

**Depends on:** Nothing blocked. PR 3 in the BRD-11 plan.
