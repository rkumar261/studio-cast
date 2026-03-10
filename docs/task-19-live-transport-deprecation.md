# Task 19 Live Transport Deprecation

## Decision

Live studio recording chunk transport is **TUS-only**.

- Live recording chunk routes under `/v1/recordings/:id/chunks/*` reject multipart.
- Multipart remains supported for non-live/manual/import/admin upload flows under `/v1/uploads/*`.

## Implementation Notes

- Studio frontend no longer exposes/configures multipart for rolling recorder chunk upload.
- Legacy live multipart endpoints are retained as explicit deprecation responses (`410`) to prevent accidental success.
- Recording chunk initiate/complete routes enforce TUS transport (`protocol: 'tus'`).

## Guardrails

- If stale multipart items exist in the studio queue, they are blocked with a clear error instead of silently succeeding.
- This change does not alter multipart behavior for `/v1/uploads/initiate` and `/v1/uploads/:id/complete`.
