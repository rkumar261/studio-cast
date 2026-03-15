# BRD/TRD 09 Telemetry Taxonomy and Metrics Map

This document is the BRD/TRD 09 telemetry and metrics source of truth for BRD/TRD 01-08.

It defines:
- the canonical event families
- which telemetry is implemented in-repo now
- which items remain platform or frontend instrumentation work
- the minimum metrics and SLA signals operations must wire up

## Telemetry Coverage Audit

| Event Family | Canonical Event | Status | Current Source | Notes |
| --- | --- | --- | --- | --- |
| Session / join | `invite_opened` | Documented gap | not emitted in backend | Requires frontend/browser instrumentation; do not guess from backend alone. |
| Session / join | `prejoin_started` | Documented gap | not emitted in backend | Requires frontend/browser instrumentation. |
| Session / join | `prejoin_failed` | Partial | `guest.bootstrap.rejected`, `guest.claim.rejected` | Server-side invite/bootstrap failures are covered; browser-only device-check failures still need frontend instrumentation. |
| Session / join | `session_join_requested` | Implemented | `session.join.requested` in [livekit.routes.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/routes/livekit.routes.ts) | Emitted on token issuance using backend truth. |
| Session / join | `session_joined` | Implemented | `session.joined`, `guest.joined.session` in [studioWebsocket.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/websocket/studioWebsocket.ts) | Distinguishes guest join and generic peer join. |
| Session / join | `session_left` | Implemented | `session.left` in [studioWebsocket.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/websocket/studioWebsocket.ts) | Covers explicit leave and connection close. |
| Session / join | `session_stop_requested` / `session_stopped` | Partial | `recording.session.stopped` | Stop completion is emitted; request-intent event is not separately emitted. |
| Track lifecycle | `track_registered` | Partial | existing persisted track create path, no explicit event | Observable via DB truth and lifecycle diagnostics; a separate event can be added later if registration funnel analytics are needed. |
| Track lifecycle | `track_recovered` | Partial | `upload.recovery.snapshot` | Recovery is observable, but not as a dedicated `track_recovered` event. |
| Track lifecycle | `track_finalize_requested` / `track_finalized` | Partial | `track.finalized` in [track-finalization.service.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/services/track-finalization.service.ts) | Finalize completion is covered; request-intent and completion share one event today. |
| Track lifecycle | `track_blocked` | Partial | blocked reasons visible in lifecycle diagnostics | Blocked state is diagnosable but not emitted as a dedicated event family yet. |
| Track lifecycle | `track_ready_for_stitch` | Implemented | `track.ready_for_stitch` in [recording-pipeline.service.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/services/recording-pipeline.service.ts) | Emitted only from backend readiness truth. |
| Chunk lifecycle | `chunk_initiate_requested` / `chunk_initiate_existing` / `chunk_initiate_seq_mismatch` | Documented gap | service returns deterministic responses, no dedicated emit | Existing backend tests cover the behavior; telemetry can be added later if initiate-volume analytics are needed. |
| Chunk lifecycle | `chunk_upload_started` / `chunk_upload_resumed` / `chunk_upload_progress` | Documented gap | not emitted in backend | Requires TUS or client-side instrumentation; backend only sees completion/materialization truth. |
| Chunk lifecycle | `chunk_completed` | Implemented | `upload.chunk.completed` in [track-chunk.service.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/services/track-chunk.service.ts) | Includes contiguous-upload context. |
| Chunk lifecycle | `chunk_materialized` | Partial | implicit in TUS completion materialization path | Materialization is folded into chunk completion today. |
| Chunk lifecycle | `chunk_failed` | Implemented | `upload.chunk.failed` in [track-chunk.service.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/services/track-chunk.service.ts) | Includes failure reason and affected identifiers. |
| Pipeline | `stitch_queued` / `stitch_started` / `stitch_completed` | Implemented | `stitch.job.queued`, `stitch.started`, `stitch.finished` | Queue and worker execution are both observable. |
| Pipeline | `transcode_queued` | Documented gap | inferred from job table only | Queue depth is observable from DB/jobs; no dedicated event today. |
| Pipeline | `transcode_completed` | Partial | `asset.participant.ready` | Participant master readiness is the product-facing truth. |
| Pipeline | `compose_combined_started` / `compose_combined_completed` | Implemented | `asset.combined.processing`, `asset.combined.ready` | Combined failure is also emitted. |
| Pipeline | `transcript_started` / `export_completed` | Partial | `transcript.ready`, `transcript.failed`, `export.ready`, `export.failed` | Completion and failure are emitted; start events are worker-local gaps. |
| Project readiness | `project_minimum_ready` | Implemented | `project.minimum_ready` in [recording-readiness.service.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/services/recording-readiness.service.ts) | Distinct from full readiness. |
| Project readiness | `project_fully_ready` | Implemented | `project.fully_ready` in [recording-readiness.service.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/services/recording-readiness.service.ts) | Tied to required-export success. |
| Project readiness | `asset_missing` / `asset_ready` | Partial | asset-specific events plus project-assets read model | Diagnostics and project-assets route explain missing/ready truth without a generic asset event. |
| Project readiness | `project_blocked` | Implemented | `project.blocked` in [recording-readiness.service.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/services/recording-readiness.service.ts) | Covers participant, combined, and required-export blockage. |
| Incident signals | backlog, failure-rate, stall, SLA breach | Specified | alert and dashboard docs in BRD 09 pack | Derived from telemetry + DB truth; platform alert wiring still required. |

## Stable Identifiers and Dimensions

Current structured backend telemetry supports:

- `recordingId`
- `sessionId`
- `participantId`
- `trackId`
- `chunkId`
- `assetId`
- `jobId`

Recommended dimensions to preserve when adding future events:

- actor kind: host or guest
- role
- track kind
- transport protocol
- lifecycle stage
- blocked stage
- failure reason

## Minimum Metrics Map

These metrics are the BRD/TRD 09 minimum set. Some are directly emitted now; others are derived from persisted truth plus telemetry.

| Metric | Source of Truth | Status | Notes |
| --- | --- | --- | --- |
| active sessions count | session route + websocket room count | Specified | Not exposed as an in-repo metrics endpoint yet. |
| active participants count | websocket room membership | Specified | Use live session instrumentation. |
| active finalized tracks pending processing | track lifecycle diagnostics | Specified | Derived from `finalized` without `ready_for_stitch`/processed completion. |
| chunk initiate rate | route access logs or future emit | Documented gap | No dedicated initiate telemetry today. |
| chunk complete rate | `upload.chunk.completed` | Implemented | Event-derived metric. |
| chunk failure rate | `upload.chunk.failed` | Implemented | Event-derived metric. |
| seq mismatch rate | invalid-seq service responses | Documented gap | Available in route/service behavior, not emitted. |
| TUS resume success rate | recovery plus successful complete after resumable upload | Partial | Requires platform aggregation logic. |
| upload retry rate | repeated recovery or repeated complete for same chunk | Partial | Derivable from event stream and chunk IDs. |
| per-participant upload completion latency | lifecycle diagnostics + `upload.participant.completed` | Implemented for derivation | Support snapshot now exposes one-recording timing context. |
| per-recording upload completion latency | `stoppedAt` -> `uploadCompletedAt` | Implemented for derivation | Available via lifecycle diagnostics and support snapshot SLA block. |
| finalize latency | finalize timestamps | Implemented for derivation | Derived from track diagnostics. |
| stop-to-all-tracks-finalized | track finalized timestamps | Implemented for derivation | Derived from diagnostics, not emitted as one metric. |
| upload-complete-but-not-finalized count | lifecycle diagnostics | Specified | Derived metric. |
| worker queue depth by job type | job table | Specified | Platform dashboard query required. |
| worker success/failure/retry counts | worker telemetry + job state | Partial | Success/failure implemented; retry count needs platform aggregation. |
| stop-to-minimum-ready | `stoppedAt` -> project minimum-ready | Implemented for derivation | Available through telemetry and support snapshot timing. |
| stop-to-fully-ready | `stoppedAt` -> `readyAt` | Implemented for derivation | Available through lifecycle diagnostics and support snapshot timing. |
| combined-output readiness latency | combined asset timestamps | Implemented for derivation | Use combined asset state and recording stop time. |
| participant-output readiness latency | participant asset timestamps | Implemented for derivation | Derived from participant assets. |
| guest join success rate | `session.join.requested` vs `session.joined` for guest | Implemented for derivation | Platform aggregation required. |
| prejoin abandonment rate | invite open vs join request | Documented gap | Requires frontend/browser analytics. |
| guest upload completion rate vs host upload completion rate | upload completion telemetry + participant role | Partial | Needs role-aware aggregation in observability platform. |

## SLA Signals

Required SLA signals:

- stop to upload complete
- stop to minimum ready
- stop to fully ready
- guest join request to joined

Current in-repo support:

- [recording-support-snapshot.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/tools/recording-support-snapshot.ts) now prints one-recording timing and SLA context.
- [lifecycle-diagnostics.dto.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/dto/recordings/lifecycle-diagnostics.dto.ts) exposes the timestamps needed for drill-down and platform aggregation.

## Explicit Platform-Side Gaps

Not implemented in-repo and must be wired in the production observability platform:

- fleet-wide metrics store
- dashboard rendering
- alert execution engine
- frontend/browser instrumentation for invite-open and device-check funnel events
