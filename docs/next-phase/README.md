# Next Phase — Refreshed Implementation Index

This folder was originally written before the `projects`-first dashboard/workspace redesign landed.

The docs below are now aligned to the current product shape:
- authenticated app shell lives under `frontend/src/app/(authenticated)`
- canonical detail route is `/projects/[id]`
- `/recordings` is a secondary archive, not the primary workspace
- `P8` is partially implemented already and changes the assumptions in older docs

## Current Status Snapshot

| Doc | Priority | Current state | Notes |
|-----|----------|---------------|-------|
| [P1-real-asr-integration.md](P1-real-asr-integration.md) | HIGH | In progress | Core Whisper integration already exists; remaining work is hardening, cleanup, and backfill |
| [P2-middleware-jwt-hardening.md](P2-middleware-jwt-hardening.md) | HIGH | Needs rewrite before implementation | Current middleware uses `/landing` rewrite + `studio_cast_session` marker |
| [P3-upload-flow-dashboard.md](P3-upload-flow-dashboard.md) | HIGH | Needs rewrite before implementation | Upload flow must end in `/projects/[id]`, not `/recordings/[id]` |
| [P4-studio-visual-harmonization.md](P4-studio-visual-harmonization.md) | MEDIUM | Ready after doc refresh | Dashboard shell is already shipped; keep this phase visual-only |
| [P5-ai-tools-podcast-cta.md](P5-ai-tools-podcast-cta.md) | MEDIUM | Needs product decision | Current AI tools / podcast CTA are still decorative and the wording is stale |
| [P6-mobile-layout.md](P6-mobile-layout.md) | MEDIUM | Needs IA refresh before implementation | Mobile nav assumptions were written before the `projects`-first IA |
| [P7-analytics-real-data.md](P7-analytics-real-data.md) | LOW | Still valid after data-source refresh | Analytics panel already supports fallback state |
| [P8-project-page-ui-overhaul.md](P8-project-page-ui-overhaul.md) | HIGH | Partially implemented | Titles, route shape, thumbnails, and layout work have already started |

## Recommended Execution Order Now

1. `P2` — settle auth/session behavior around the current middleware and landing rewrite
2. `P3` — add the upload flow in a `projects`-first way
3. `P4` — visually harmonize studio with the shipped dashboard shell
4. `P6` — mobile responsive pass on the current IA
5. `P7` — replace fake analytics data

Parallel / background work:
- `P1` should continue as transcript-quality hardening and transcript backfill work, not as a fresh ASR implementation phase
- `P5` should only move forward after the home-page CTA/product messaging is confirmed

## Important Product Assumptions

- `Home` is the discovery/dashboard surface
- `Projects` is the primary project index
- `Project` (`/projects/[id]`) is the canonical workspace
- `Recordings` is an archive / utility surface
- Studio runtime pages should not be structurally rewritten inside the visual phases unless the doc explicitly says so
