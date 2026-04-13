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

## Deferred from feat/project-page-layout (dashboard + project workspace redesign)

### Wire real analytics data to DashboardAnalyticsPanel
**What:** Replace the "coming soon" placeholder in `DashboardAnalyticsPanel` with real per-user metrics (total minutes recorded, episode count, last recording date) from a new `/v1/analytics/summary` backend endpoint.

**Why:** The analytics section is built slot-ready (accepts optional data props, shows preview badge when absent) but has no real data. Users see empty placeholder state indefinitely.

**Pros:** Completes the home dashboard experience. Gives users meaningful usage insight.

**Cons:** Requires a new backend endpoint with DB aggregation queries. Not blocking for alpha.

**Context:** `DashboardAnalyticsPanel` in `frontend/src/components/dashboard/` accepts `data?: AnalyticsSummary` prop. When absent, renders a "Coming soon" badge. Backend needs `GET /v1/analytics/summary` returning `{ totalMinutesRecorded, episodeCount, lastRecordingAt }`. Add to the recordings domain service.

**Depends on:** Dashboard redesign (feat/project-page-layout) must be shipped first.

---

### Harden middleware auth check with JWT signature verification
**What:** The `middleware.ts` added in feat/project-page-layout checks only for cookie *presence* to determine auth state for redirect logic. Upgrade to verify the JWT signature using `jose` so tampered or expired tokens don't pass the middleware redirect.

**Why:** Cookie presence check can be bypassed by setting a fake `access_token` cookie, which would redirect users to the authenticated shell where all API calls will 401. Not a security hole (APIs still check JWT) but causes confusing UX.

**Pros:** Correct behavior on expired/invalid tokens — middleware redirects to sign-in rather than bouncing at the API layer.

**Cons:** `jose` JWT verify adds ~5ms latency to every request hitting the middleware matcher. The public key must be available at the edge runtime (check Next.js edge runtime constraints for file system access).

**Context:** Middleware is at `frontend/src/middleware.ts`. Auth uses RS256 keypair. The public key is at `JWT_PUBLIC_KEY_PATH` on the backend — for the frontend edge, export the public key as `NEXT_PUBLIC_JWT_PUBLIC_KEY` env var (safe, it's a public key). Use `jose.importSPKI` + `jose.jwtVerify`.

**Depends on:** feat/project-page-layout middleware must be shipped first.

---

