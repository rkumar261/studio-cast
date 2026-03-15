# BRD/TRD 08 Severity, Release Blocking, and QA Governance

This document codifies BRD/TRD 08 severity handling, release blocking, and QA maintenance rules.

## Severity Matrix

| Severity | Meaning | Example |
| --- | --- | --- |
| Sev 1 | Core recording journey is unavailable or corrupted for most users | recordings cannot be created or upload truth is corrupted |
| Sev 2 | In-scope host, guest, upload, processing, or project journey is materially broken for a release candidate | guest cannot join, project never reaches minimum-ready, combined asset pipeline broadly failing |
| Sev 3 | Non-core but real degradation with workaround | one optional derivative fails while minimum-ready still works |
| Sev 4 | Cosmetic, documentation, or low-risk operator issue | wording issue in runbook or missing optional note |

## Release-Blocking Rule

- Any open in-scope Sev 1 blocks release.
- Any open in-scope Sev 2 blocks release unless there is explicit written acceptance from the release owner and product owner.
- Sev 3 can ship only with:
  - written accepted-risk note
  - owner
  - mitigation or follow-up plan
- Sev 4 does not block release by default.

## Accepted-Risk Rule

Accepted risk must state:

- affected scenario IDs
- severity
- user impact
- why release still proceeds
- mitigation
- owner
- review date

If any of those are missing, the issue is not accepted risk. It is an open blocker.

## QA Entry Criteria

Before BRD/TRD 08 validation starts:

1. Schema and runtime changes for the target slice are merged.
2. Required env variables and services are available.
3. Automated tests for changed product logic are present or the gap is documented.
4. Consumer-facing states are backed by persisted truth and observable signals.

## QA Exit Criteria

Before release signoff:

1. Gates 1-5 in [brd-trd-08-release-evidence.md](/Users/rakeshkumar/dev/projects/studio-cast/docs/brd-trd-08-release-evidence.md) have evidence.
2. Required scenarios in [brd-trd-08-qa-traceability.md](/Users/rakeshkumar/dev/projects/studio-cast/docs/brd-trd-08-qa-traceability.md) are green or explicitly accepted in writing.
3. Required runbooks exist and match the current architecture.
4. No undocumented deviation from BRD/TRD 01-08 remains.

## QA Definition of Done

The QA system is complete for a change only when:

1. changed behavior has automated coverage where practical
2. browser/media/network realism gaps have manual scenarios
3. support/on-call has a matching runbook
4. operators have observable signals without database archaeology
5. release evidence is attached to a real gate

## Maintenance Rules

- When a new user-visible state is added or renamed:
  - update automated tests or add new ones
  - update the traceability matrix
  - update the manual scenario pack if browser realism matters
  - update observability mapping and runbooks if operations will need to diagnose it
- When a route becomes owner-only or guest-safe:
  - update authorization tests
  - update the traceability matrix and `RB-04`
- When a pipeline stage or worker changes:
  - update alert and runbook mapping
  - update support snapshot expectations if needed

## Trust Rule

If a state cannot be verified through persisted truth, observable signal, or a test/manual check, it is not trusted enough to ship.
