# Recording Acceptance Scenarios (T20)

This checklist validates release criteria for the full recording path:
- Host-controlled session
- Multi-guest room behavior (LiveKit path)
- Chunk upload completion (tus/multipart)
- Export readiness gate (`wav`, `mp4`, `mp4_captions`)

## Automated Gate
After running a scenario, verify final readiness with:

```bash
cd backend
API_BASE=http://localhost:8080 \
AUTH_COOKIE='access_token=<cookie>' \
RECORDING_ID='<recording-id>' \
ACCEPT_TARGET_PARTICIPANTS=10 \
npm run acceptance:recording
```

## Scenario Matrix

1. Multi-guest baseline (target 10)
- Start a studio session with host + 9 guests using LiveKit.
- Record for at least 60s.
- Stop session.
- Expected: progress reaches `ready` and all required exports succeed.

2. Guest reconnect during recording
- During active recording, force-close 1-2 guest tabs.
- Rejoin with same invite/session.
- Continue recording for 30s.
- Stop session.
- Expected: flow still reaches exports-ready without manual DB intervention.

3. Upload retry path
- During upload phase, simulate transient network loss for one client and restore.
- Confirm chunk queue retries and pending chunks eventually reach zero.
- Expected: no permanent stuck `in_progress` chunks.

4. Captions export readiness
- Confirm transcript segments are present for the recording.
- Verify `mp4_captions` transitions `queued/running -> succeeded`.
- Download artifact and confirm burned subtitles are visible.

## Failure Triage
- Run maintenance worker once to clear stale running states:

```bash
cd backend
MAINTENANCE_RUN_ONCE=1 npm run dev:worker:maintenance
```

- Check API progress:

```bash
curl -H "Cookie: access_token=<cookie>" http://localhost:8080/v1/recordings/<recording-id>/progress
```
