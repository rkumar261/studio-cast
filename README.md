# Studio Cast

Studio Cast is a Riverside-style remote recording platform.

- Live WebRTC studio (host/guest, later multi-participant)
- Tech Check page (mic/cam selection, local test recording)
- Reliable uploads and processing jobs (FFmpeg → ASR → transcripts)
- Exports with captions and Magic Clips

## Structure

- `backend/`  – API, auth, recording sessions, uploads, processing jobs
- `frontend/` – Next.js UI (Tech Check, Studio, recordings dashboard)
