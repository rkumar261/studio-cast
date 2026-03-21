# BRD/TRD 08 Release Evidence Pack

This document defines the evidence package for a BRD/TRD 08 release candidate.

A release candidate is not complete because code merged. It is complete when Gates 1-5 have evidence attached.

## Gate Checklist

| Gate | Minimum Condition | Required Artifact | Owner |
| --- | --- | --- | --- |
| Gate 1 Build health | Backend builds, migrations apply, critical workers start | build log, migration log, worker startup log | engineering |
| Gate 2 Functional baseline | Happy-path host, guest, upload-complete, and project presentation pass | automated test report plus manual scenario notes | engineering + QA |
| Gate 3 Resilience | Refresh, reconnect, retry, delayed completion, and readiness gating pass | backend regression report and manual resilience report | engineering + QA |
| Gate 4 Operational readiness | Runbooks, alerts, dashboards, and support tooling are current | runbook signoff, alert/dashboard checklist, support tooling smoke output | engineering + support |
| Gate 5 Release verification | Post-deploy smoke checks pass in target environment | smoke report, go/no-go note, accepted-risk note if any | release owner |

## Release Candidate Evidence Template

### 1. Build and Migration Evidence

- backend build result
- frontend build or documented typecheck fallback result
- migration command used
- environment note:
  - schema version
  - worker versions
  - runtime env differences from local/dev

### 2. Automated Regression Evidence

Attach or summarize:

- `backend npm test`
- `backend npm run build`
- targeted regression runs if used
- Playwright smoke runs that were executed

Each result should name the covered scenario IDs from [brd-trd-08-qa-traceability.md](/Users/rakeshkumar/dev/projects/studio-cast/docs/brd-trd-08-qa-traceability.md).

### 3. Manual Scenario Evidence

Minimum scenarios for release signoff:

- `HOST-CORE-001`
- `GUEST-CORE-001`
- `GUEST-CORE-003`
- `UPLOAD-RECOVERY-005`
- `PROJECT-ASSET-001`

For each scenario attach:

- operator or QA owner
- date and environment
- recording ID
- screenshot or short clip
- pass/fail
- related support snapshot if not green

### 4. Operational Readiness Evidence

Attach:

- support snapshot `--help` or live run result
- runbook review confirmation
- dashboard and alert checklist from [brd-trd-08-observability-runbooks.md](/Users/rakeshkumar/dev/projects/studio-cast/docs/brd-trd-08-observability-runbooks.md)
- severity and release-blocking review from [brd-trd-08-severity-and-governance.md](/Users/rakeshkumar/dev/projects/studio-cast/docs/brd-trd-08-severity-and-governance.md)

### 5. Post-Deploy Smoke Evidence

Run at least:

- one owner recording detail page load
- one owner project assets page load
- one guest invite join
- one support snapshot or lifecycle-diagnostics call

Record:

- exact environment name
- deployment identifier
- smoke timestamp
- pass/fail by scenario ID

## Go / No-Go Note

Every release candidate needs a written decision:

- `GO`: all required gates green
- `GO WITH ACCEPTED RISK`: only for documented Sev 3/4 issues with explicit owner and mitigation
- `NO-GO`: any Gate 1 failure, any open in-scope Sev 1/2, or missing required evidence

## Evidence Retention Rule

Keep the evidence pack linked from the release ticket or deployment record. Do not rely on ephemeral chat history as release evidence.
