# P2 — Middleware and Session Hardening

**Priority:** HIGH  
**Status:** Not started on the refreshed plan  
**Blocks:** Reliable auth UX for protected project routes  
**Effort:** Human ~4-6 hours / CC ~20-30 min

---

## Why This Doc Changed

The original version assumed:
- redirect everything to `/sign-in`
- auth state is just `access_token` presence
- middleware can be treated independently from the landing rewrite

That is no longer true.

Current frontend auth shape:
- signed-out `/` rewrites to `/landing`
- protected routes are `/projects`, `/projects/:id`, `/recordings`, `/settings`
- middleware currently trusts `studio_cast_session` **or** `access_token`
- client session recovery still depends on `/auth/me` and cookie-based backend auth

## Current Problem

Current `frontend/src/middleware.ts` is a UX gate, not a trustworthy auth gate.

It currently:
- checks only cookie presence
- can be fooled by fake/stale cookies
- does not preserve the intended destination for deep links
- can disagree with backend session truth when the marker cookie drifts

Examples:
- valid backend session + missing frontend marker can bounce the user incorrectly
- fake `access_token` cookie can look authenticated to middleware
- protected deep links can collapse back to `/` instead of returning to the requested project

## Goals

1. Preserve the current `landing`-rewrite model.
2. Make protected-route behavior predictable.
3. Preserve deep-link intent for `/projects/[id]`.
4. Decide explicitly whether JWT verification belongs in middleware or whether middleware stays a light UX router.

## Recommended Approach

Implement this phase in two parts.

### Part A — Session correctness (required)

This is the real must-have.

1. Preserve requested protected destination.
   - If an unauthenticated user hits `/projects/[id]`, redirect or rewrite in a way that keeps `next=/projects/[id]`.
2. When the user becomes authenticated on `/landing`, redirect them back to `next`, not always to `/`.
3. Keep `studio_cast_session` synchronized with real successful `/auth/me` checks.
4. Make logout/session expiry clear both marker cookies and route state consistently.

### Part B — JWT verification at the edge (optional / only if product wants it)

This can be added after Part A.

If done:
- verify `access_token` with `jose`
- clear invalid token cookies
- do **not** break refresh-based or backend-cookie-based recovery flows

Important: do not implement a strict “missing `access_token` means signed out” rule if current backend session recovery still depends on other cookies.

## Current Files

Primary files:
- `frontend/src/middleware.ts`
- `frontend/src/app/(public)/landing/page.tsx`
- `frontend/src/lib/useSession.tsx`

Secondary files:
- `frontend/src/lib/api.ts`

## Implementation Plan

### Step 1 — Preserve protected route intent

Update middleware so protected-route redirects include the requested destination.

Example intent:

```text
/projects/abc123
  -> unauthenticated
  -> /landing?next=%2Fprojects%2Fabc123
```

### Step 2 — Respect `next` after login/session recovery

Update the public landing flow so that:
- successful auth or valid session on `/landing`
- redirects to the `next` path first
- falls back to `/` only when no `next` exists

### Step 3 — Tighten cookie semantics

Review the current relationship between:
- `studio_cast_session`
- `access_token`
- backend-managed auth cookies

The doc target is:
- marker cookie is a convenience only
- backend `/auth/me` remains the source of truth
- logout clears both frontend marker state and backend session state

### Step 4 — Optional JWT verification

Only after the current session contract is stable:
- add `jose`
- verify `access_token` signature/expiry in middleware
- clear invalid cookies safely
- fall back without breaking legitimate refresh/session recovery

If this part is implemented, document the public key strategy explicitly.

## Suggested File Changes

| File | Change |
|------|--------|
| `frontend/src/middleware.ts` | Preserve `next`, tighten protected route logic |
| `frontend/src/app/(public)/landing/page.tsx` | Redirect back to intended path after auth |
| `frontend/src/lib/useSession.tsx` | Keep marker cookie behavior aligned with real auth state |
| `frontend/.env.local` / `.env.example` | Only if JWT verification is actually added |

## Verification

1. Signed-out user opens `/projects/[id]` directly.
2. They are sent to `/landing?next=...`.
3. After login/session recovery, they land on the original `/projects/[id]`.
4. Fake/stale cookie values do not permanently trap the user in a bad auth state.
5. Logout clears session state and returns to a signed-out landing flow.
6. Run:

```bash
cd frontend && npm run typecheck
cd frontend && npm run lint
```

If Playwright coverage is updated, add:
- deep-link protected route recovery
- logout
- missing marker + valid session recovery
