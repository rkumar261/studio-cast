# State Models

This document defines the main lifecycle and state concepts the system uses today.

These are the concepts future refactors must preserve unless an explicit migration plan is approved.

## 1. Recording / Project Truth

The product is `projects`-first in the UI, but the backend canonical entity is still `recording`.

That means:
- project index cards are recording-backed
- `/projects/[id]` is a recording-backed workspace
- naming, assets, and transcript state all hang off recording IDs today

## 2. Recording Lifecycle

Database lifecycle enum:
- `created`
- `prejoin`
- `idle`
- `preparing`
- `recording`
- `post_stop_uploading`
- `upload_complete`
- `stopping`
- `uploading`
- `processing`
- `ready`
- `blocked`
- `failed`

Practical UI meaning:
- `created` / `prejoin` / `idle`: session exists but not recording-ready yet
- `recording`: live session in progress
- `uploading` / `post_stop_uploading` / `upload_complete`: media capture stopped, browser/server ingest still in progress
- `processing`: workers are building usable outputs
- `ready`: project workspace is materially usable
- `blocked` / `failed`: user action or operator action is needed

## 3. Consumer-Facing Recording State

Frontend uses consumer-facing project/recording states such as:
- `invited`
- `uploading`
- `upload complete`
- `processing`
- `ready`
- `action required`

These power badges and UI flow labels and are separate from the deeper DB lifecycle.

## 4. Track Lifecycle

Database lifecycle enum:
- `registered`
- `recording`
- `capture_closed`
- `finalized`
- `ready_for_stitch`
- `ingest_ready`
- `stitched`
- `processed`
- `transcoded`
- `ready`
- `blocked`
- `failed`

This lifecycle matters for:
- participant media readiness
- combined asset availability
- project workspace track status

## 5. Asset State

Asset-like entities use:
- `pending`
- `processing`
- `ready`
- `failed`

This applies to:
- combined assets
- participant assets
- transcript-related assets
- export artifacts

## 6. Transcript State

Transcript state uses:
- `pending`
- `processing`
- `ready`
- `failed`

Transcript UX must preserve:
- draft/revision behavior
- publish status
- editable segment representation

## 7. Export State

Legacy export state:
- `queued`
- `running`
- `succeeded`
- `failed`

These states still appear in export artifacts and worker flows.

## 8. Host Studio Phase

Frontend host-phase derivation currently treats host runtime as:
- `host_prepared`
- `recording_active`
- `stop_requested`
- `uploading_after_stop`
- `studio_upload_complete`
- `project_processing`
- `project_ready`

This is a derived UI model, not the core DB truth.

## 9. Naming Rules

When title is not explicitly set:
- combined project/recording title should fall back to participant names joined by ` & `
- individual participant outputs should use their own participant display name

`Untitled project` should remain only as the last-resort fallback when participant naming data is genuinely unavailable.

## 10. Invariants To Preserve

- `/projects/[id]` must always resolve against a recording-backed workspace
- processing state must not imply readiness too early
- transcript/export artifacts must not be duplicated in the flat workspace list
- participant and combined naming must remain deterministic
