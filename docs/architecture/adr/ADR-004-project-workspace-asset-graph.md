# ADR-004: Project Workspace Asset Graph Ownership

## Status
Accepted

## Context

The project workspace depends on a combined graph of recording detail, participants, combined assets, participant assets, transcript state, and export artifacts.

Historically, shaping logic grew into a large mixed-responsibility service and hook.

## Decision

Treat the project workspace asset graph as a first-class contract:
- backend assembles canonical asset graph data
- frontend view-models shape that contract into workspace sections
- duplicate artifacts must be normalized before rendering
- transcript/editor remains a dedicated workspace section, not a random repeated artifact

## Consequences

- backend decomposition should preserve this graph contract
- frontend refactors should separate mapper/query/action concerns
- future workspace changes should be made against this contract, not ad hoc page logic
