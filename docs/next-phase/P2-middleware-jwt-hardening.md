# P2 — Middleware JWT Hardening

**Priority:** HIGH
**Status:** Not started
**Blocks:** Security before public users
**Effort:** Human ~4 hours / CC ~15 min

---

## Problem

`frontend/src/middleware.ts` currently checks only for the **presence** of the `access_token` cookie to decide whether to redirect to `/sign-in`. It does not verify the JWT signature or expiry.

**Current behavior:**
- Set a fake cookie `access_token=anything` → middleware thinks you're logged in
- Expired JWT → middleware still passes you through → all API calls 401 → confusing UX

**Impact:** Not a security hole (all API routes check the JWT server-side), but causes confusing bounce-loop UX and is incorrect auth state signaling.

## Current Implementation

```typescript
// frontend/src/middleware.ts (current — cookie presence only)
const token = request.cookies.get('access_token');
if (!token) {
  return NextResponse.redirect(new URL('/sign-in', request.url));
}
// No signature check — any value passes
```

## Implementation

### Step 1 — Export public key as env var

The backend uses RS256 keypair. The public key is already on the backend at `JWT_PUBLIC_KEY_PATH`.

Add to `frontend/.env.local`:
```
NEXT_PUBLIC_JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nMIIBIj...\n-----END PUBLIC KEY-----"
```

**Why `NEXT_PUBLIC_`?** The middleware runs at the edge runtime. File system access is not available in Next.js edge. The public key must be embedded as an env var. Public keys are safe to expose (they're public).

Export the public key from your backend keypair:
```bash
openssl rsa -in /path/to/private.pem -pubout -out public.pem
cat public.pem  # copy into .env.local
```

### Step 2 — Update middleware.ts

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { importSPKI, jwtVerify } from 'jose';

const PUBLIC_ROUTES = ['/sign-in', '/sign-up', '/auth'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth check for public routes
  if (PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.next();
  }

  const token = request.cookies.get('access_token')?.value;

  if (!token) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  // Verify JWT signature + expiry
  try {
    const publicKeyPem = process.env.NEXT_PUBLIC_JWT_PUBLIC_KEY!;
    const publicKey = await importSPKI(publicKeyPem, 'RS256');
    await jwtVerify(token, publicKey, { algorithms: ['RS256'] });
    return NextResponse.next();
  } catch {
    // Invalid or expired token — clear cookie and redirect
    const response = NextResponse.redirect(new URL('/sign-in', request.url));
    response.cookies.delete('access_token');
    return response;
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/).*)',
  ],
};
```

### Step 3 — Key import caching

`importSPKI` is called per-request. Cache it at module level:

```typescript
let _cachedPublicKey: CryptoKey | null = null;

async function getPublicKey(): Promise<CryptoKey> {
  if (_cachedPublicKey) return _cachedPublicKey;
  const pem = process.env.NEXT_PUBLIC_JWT_PUBLIC_KEY!;
  _cachedPublicKey = await importSPKI(pem, 'RS256');
  return _cachedPublicKey;
}
```

## Edge Runtime Constraints

- `jose` works in Next.js edge runtime (uses Web Crypto API, not Node crypto)
- `fs`, `path`, `child_process` do NOT work in edge runtime — do not use them
- `process.env` works in edge runtime for static env vars

## Performance

`importSPKI` + `jwtVerify` adds ~3-5ms per request. With module-level key caching, repeat requests add ~1ms (just the verify call). Acceptable.

## Data Flow

```
Request → middleware
  │
  ├─ public route? → pass through
  │
  ├─ no cookie? → redirect /sign-in
  │
  └─ cookie present?
        │
        ├─ jwtVerify(token, RS256 public key)
        │     ├─ valid + not expired → NextResponse.next()
        │     └─ invalid / expired → delete cookie + redirect /sign-in
        │
        └─ importSPKI error (bad env var) → log + redirect /sign-in (fail safe)
```

## Files to Change

| File | Change |
|------|--------|
| `frontend/src/middleware.ts` | Add `jose` JWT verification |
| `frontend/.env.local` | Add `NEXT_PUBLIC_JWT_PUBLIC_KEY` |
| `frontend/.env.example` | Document the new var |

## Dependencies

`jose` is already a dependency in most Next.js projects. Check:
```bash
cd frontend && grep "jose" package.json
```

If not present: `npm install jose`

## Verification

1. Log in normally — should work as before
2. Manually set a fake `access_token` cookie in browser devtools → should redirect to `/sign-in`
3. Let token expire (or use a token with wrong expiry) → should redirect to `/sign-in` and clear cookie
4. Run `npm run typecheck` in `frontend/` — must pass
5. Run `npm run build` in `frontend/` — edge runtime must accept the middleware
