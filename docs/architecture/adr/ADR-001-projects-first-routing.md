# ADR-001: Projects-First Routing

## Status
Accepted

## Context

The product originally exposed more recording-centric detail paths, but user workflows needed a single operational workspace for preview, tracks, transcript, and exports.

## Decision

Adopt `projects`-first routing in the UI:
- `/projects` is the primary index
- `/projects/[id]` is the canonical detail route
- `/recordings` is a secondary archive
- `/recordings/[id]` is compatibility-only

## Consequences

- frontend language and navigation become project-centered
- backend remains recording-backed internally for now
- future refactors must preserve `/projects/[id]` as canonical unless explicitly changed by a new ADR
