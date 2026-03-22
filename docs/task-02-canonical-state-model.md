# Task 02 Canonical State Model (BRD 01 / TRD 01)

This document is the backend state-transition reference added by Task 02.

## Scope
- Source of truth: BRD 01 + TRD 01 + Task 01 baseline.
- This task aligns schema and migration surfaces only.
- Existing runtime `recording.status` and `track.state` flows are intentionally preserved for backward-safe rollout.

## Canonical lifecycle states

### Recording
- `created -> preparing -> recording -> stopping -> uploading -> processing -> ready | failed`
- Backed by `recording.lifecycle_state`.
- Audit fields:
  - `started_at`, `stopped_at`, `upload_completed_at`, `processing_started_at`, `ready_at`, `failed_at`, `failure_reason`, `updated_at`.

### Track
- `registered -> recording -> finalized -> ingest_ready -> stitched -> transcoded -> ready | failed`
- Backed by `track.lifecycle_state`.
- Audit fields:
  - `final_seq`, `capture_closed_at`, `finalized_at`, `ingest_ready_at`, `stitched_at`, `transcoded_at`, `ready_at`, `failed_at`, `failure_reason`, `updated_at`.

### Chunk
- Existing ingest states remain canonical for chunk transport lifecycle:
  - `initiated -> uploading -> uploaded | failed`
- Backed by `track_chunk.state`.
- Audit fields:
  - `bytes_received`, `bytes_expected`, `materialized_at`, `uploaded_at`, `last_error_at`, `failed_at`, `failure_reason`, `updated_at`.

### Participant Asset / Combined Asset
- `pending -> processing -> ready | failed`
- Backed by `participant_asset.state` and `combined_asset.state`.
- Audit fields:
  - `processing_started_at`, `ready_at`, `failed_at`, `failure_reason`, `updated_at`.

### Transcript
- `pending -> processing -> ready | failed`
- Backed by `transcript.state`.
- Audit fields:
  - `processing_started_at`, `ready_at`, `failed_at`, `failure_reason`, `updated_at`.

### Export
- Existing `export_artifact.state` remains:
  - `queued -> running -> succeeded | failed`
- Additional audit fields:
  - `started_at`, `ready_at`, `failed_at`, `failure_reason`, `updated_at`.
- Optional ownership links now supported:
  - `participant_asset_id`, `combined_asset_id`, `transcript_id`.

### Job
- Existing `job.state` remains:
  - `queued -> running -> succeeded | failed | dead`
- Additional audit fields:
  - `started_at`, `completed_at`, `failed_at`, `updated_at`.

## Backward-safe rollout note
- Legacy fields remain valid for existing code paths and queries.
- New canonical fields are additive and nullable/defaulted where appropriate.
- Future tasks should migrate services to write/read canonical lifecycle fields directly.
