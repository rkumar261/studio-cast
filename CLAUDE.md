# CLAUDE.md

## gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

Available gstack skills:
- `/office-hours`
- `/plan-ceo-review`
- `/plan-eng-review`
- `/plan-design-review`
- `/design-consultation`
- `/review`
- `/ship`
- `/browse`
- `/qa`
- `/qa-only`
- `/design-review`
- `/setup-browser-cookies`
- `/retro`
- `/investigate`
- `/document-release`
- `/codex`
- `/careful`
- `/freeze`
- `/guard`
- `/unfreeze`
- `/gstack-upgrade`

If gstack skills aren't working, run the following to build the binary and register skills:

```
cd .claude/skills/gstack && ./setup
```

## Media upload — R2 CORS required

Chunks are uploaded **directly from the browser to R2** via presigned PUT URLs.
The R2 bucket **must** have a CORS policy allowing PUT from the frontend origin,
or every upload will fail silently.

Apply once per bucket (replace origin as needed):

```bash
wrangler r2 bucket cors put <bucket-name> \
  --rules '[{"AllowedOrigins":["http://localhost:3000","https://your-domain.com"],"AllowedMethods":["PUT"],"AllowedHeaders":["Content-Type","Content-Length"],"MaxAgeSeconds":3600}]'
```

Or via the Cloudflare dashboard: R2 → bucket → Settings → CORS policy.

## Required env vars (server will refuse to start without these)

```
R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
R2_PUBLIC_BASE_URL, R2_ENDPOINT (or R2_ACCOUNT_ID)
```

See `backend/.env.example` for the full template.
