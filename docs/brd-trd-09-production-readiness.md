# BRD/TRD 09 Production-Readiness Evidence Pack

This document defines the observability and production-operations evidence required before release signoff.

## Required Evidence Areas

1. Telemetry coverage
2. Metrics and SLA mapping
3. Dashboard provisioning
4. Alert provisioning
5. Diagnostics tooling
6. Runbook completeness
7. Operational smoke verification

## Evidence Checklist

| Area | Required Evidence | Current In-Repo Evidence | External/Platform Requirement |
| --- | --- | --- | --- |
| Telemetry taxonomy | event map and source audit | [brd-trd-09-telemetry-taxonomy.md](/Users/rakeshkumar/dev/projects/studio-cast/docs/brd-trd-09-telemetry-taxonomy.md) | none |
| Metrics and SLA mapping | metric source map and SLA definitions | [brd-trd-09-telemetry-taxonomy.md](/Users/rakeshkumar/dev/projects/studio-cast/docs/brd-trd-09-telemetry-taxonomy.md) | metrics backend wiring |
| Dashboards | dashboard spec and owners | [brd-trd-09-dashboards-alerts.md](/Users/rakeshkumar/dev/projects/studio-cast/docs/brd-trd-09-dashboards-alerts.md) | actual dashboard implementation |
| Alerts | alert rules, severity, owner, runbook links | [brd-trd-09-dashboards-alerts.md](/Users/rakeshkumar/dev/projects/studio-cast/docs/brd-trd-09-dashboards-alerts.md) | alert engine wiring |
| Diagnostics | one-recording support path | [recording-support-snapshot.ts](/Users/rakeshkumar/dev/projects/studio-cast/backend/src/tools/recording-support-snapshot.ts), [brd-trd-09-diagnostics-runbooks.md](/Users/rakeshkumar/dev/projects/studio-cast/docs/brd-trd-09-diagnostics-runbooks.md) | none |
| Runbooks | incident-response pack | [brd-trd-09-diagnostics-runbooks.md](/Users/rakeshkumar/dev/projects/studio-cast/docs/brd-trd-09-diagnostics-runbooks.md) | review and publish in ops system |
| Governance | observability DoD and maintenance rules | [brd-trd-09-observability-governance.md](/Users/rakeshkumar/dev/projects/studio-cast/docs/brd-trd-09-observability-governance.md) | none |

## Operational Smoke Checks

Before production signoff, verify:

1. `backend npm run support:recording -- --help`
2. one live support snapshot against a real recording
3. lifecycle diagnostics accessible for owner and denied for guest
4. telemetry query recipe works for one recording ID
5. dashboard and alert references are provisioned in the target environment

## Go / No-Go Rule

`GO` requires:

- telemetry taxonomy reviewed
- dashboard and alert owners assigned
- runbooks linked from alerts
- operator diagnostics smoke check passed

`NO-GO` if:

- there is no support path for one-recording diagnosis
- alert ownership is missing
- required platform-side dashboard or alert setup is absent without written acceptance

## Explicit Platform Gaps

The following are not implemented in-repo and must be completed in the deployment environment:

- telemetry sink and retention policy
- dashboard provisioning
- alert engine provisioning
- browser telemetry for invite-open/device-check funnel

These gaps are acceptable only if they are tracked explicitly in the release record.
