# BRD/TRD 09 Observability Definition of Done and Maintenance Rules

This document is the BRD/TRD 09 observability governance note.

## Observability Definition of Done

A lifecycle or readiness change is not done unless:

1. backend truth exists
2. telemetry exists or the lack is documented explicitly
3. at least one metric or derived detection path exists
4. operator drill-down exists
5. alert and runbook impact has been reviewed

## Maintenance Rules

- If a lifecycle state changes:
  - update telemetry taxonomy
  - update dashboard and alert mapping
  - update support snapshot or diagnostics expectations if relevant
- If a guest/host boundary changes:
  - update auth telemetry and runbooks
- If a worker or asset stage changes:
  - update queue/backlog metrics, alerts, and drill-down docs
- If a product UI state changes:
  - keep operator detail out of product payloads and update diagnostics docs separately

## Separation Rule

- Product-facing APIs and UI should stay consumer-safe and product-oriented.
- Operator detail belongs in telemetry, diagnostics, dashboards, alerts, and runbooks.

## Trust Rule

If a critical state cannot be observed, correlated, and diagnosed from backend truth, it is not production-ready enough to trust.
