# ADR-002: Auth Session Routing Strategy

## Status
Accepted

## Context

The app needs fast UX routing for signed-in vs signed-out users while backend cookies remain the real auth source of truth.

## Decision

Use:
- middleware-based route gating for UX
- signed-out root rewrite to `/landing`
- session-marker support for smoother client routing behavior
- backend cookie/session validation for true auth state

## Consequences

- middleware is a UX layer, not the sole auth authority
- deep-link recovery must remain preserved
- future auth hardening must preserve current route semantics unless explicitly redesigned
