# Studio Cast

Studio Cast is an AI Enabled Recording Studio.

- Live WebRTC studio (host/guest, later multi-participant)
- Tech Check page (mic/cam selection, local test recording)
- Reliable uploads and processing jobs (FFmpeg → ASR → transcripts)
- Exports with captions and Magic Clips

## Structure

- `backend/`  – API, auth, recording sessions, uploads, processing jobs
- `frontend/` – Next.js UI (Tech Check, Studio, recordings dashboard)

## Consumer vs Internal Surfaces

- Consumer-facing recording routes and pages are limited to the recordings dashboard, recording detail, recording progress, project assets, studio, and guest thanks flows.
- Shared frontend API surface lives in `frontend/src/lib/api.ts` and should stay product-oriented.
- Studio capture/upload internals live under `frontend/src/lib/studio/` and may use low-level track or chunk endpoints that must not be reused in consumer project pages.
