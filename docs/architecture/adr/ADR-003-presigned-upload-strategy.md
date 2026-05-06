# ADR-003: Presigned Multipart Upload Strategy

## Status
Accepted

## Context

The product historically carried TUS-related code, but the active user-facing flows moved to direct multipart uploads.

## Decision

Active upload flows use presigned multipart uploads for:
- dashboard upload flow
- current project-create upload flow
- active browser-managed media upload paths

Legacy TUS code may remain only for compatibility/migration until explicitly removed.

## Consequences

- new upload features should target presigned multipart first
- architecture docs should treat TUS as legacy, not primary
- future cleanup can remove TUS once no active path depends on it
