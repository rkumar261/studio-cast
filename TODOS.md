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
