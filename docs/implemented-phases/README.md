# Implemented Phases — Archive Index

This folder contains the phase docs that were originally tracked under `docs/next-phase/`.

They have been moved here because the work is no longer "next phase" planning. The product shape these docs target is:
- authenticated app shell lives under `frontend/src/app/(authenticated)`
- canonical detail route is `/projects/[id]`
- `/recordings` is a secondary archive, not the primary workspace
- `P8` is partially implemented already and changes the assumptions in older docs

## Current Status Snapshot

| Doc | Priority | Current state | Notes |
|-----|----------|---------------|-------|
| [P1-real-asr-integration.md](P1-real-asr-integration.md) | HIGH | Partially implemented | Core Whisper integration exists; remaining work is hardening, cleanup, and transcript backfill |
| [P2-middleware-jwt-hardening.md](P2-middleware-jwt-hardening.md) | HIGH | Implemented | Middleware and auth redirect/session-marker flow are live |
| [P3-upload-flow-dashboard.md](P3-upload-flow-dashboard.md) | HIGH | Implemented | Upload flow is projects-first and lands on `/projects/[id]` |
| [P4-studio-visual-harmonization.md](P4-studio-visual-harmonization.md) | MEDIUM | Implemented | Studio and thanks pages were visually aligned with the workspace shell |
| [P5-ai-tools-podcast-cta.md](P5-ai-tools-podcast-cta.md) | MEDIUM | Implemented | Home secondary CTAs are now wired to real project flows |
| [P6-mobile-layout.md](P6-mobile-layout.md) | MEDIUM | Implemented | Mobile workspace nav and responsive dashboard/project layouts are live |
| [P7-analytics-real-data.md](P7-analytics-real-data.md) | LOW | Implemented | Dashboard analytics now use backend summary data |
| [P8-project-page-ui-overhaul.md](P8-project-page-ui-overhaul.md) | HIGH | Partially implemented | Titles, route shape, thumbnails, and layout work have already started |

## Archive Notes

This folder is now an implementation archive, not an active backlog.

## Important Product Assumptions

- `Home` is the discovery/dashboard surface
- `Projects` is the primary project index
- `Project` (`/projects/[id]`) is the canonical workspace
- `Recordings` is an archive / utility surface
- Studio runtime pages should not be structurally rewritten inside the visual phases unless the doc explicitly says so
