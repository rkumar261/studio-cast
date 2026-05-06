# Backend Modules Standard

This document defines how backend code must be organized and how modules are allowed to depend on each other.

## 1. Backend Layering

Allowed dependency direction:
- `routes -> services -> repositories/lib`
- `workers -> services -> repositories/lib`
- `dto` can be referenced by routes and services

Disallowed:
- routes calling Prisma directly
- repositories importing route modules
- workers depending on route modules
- presentation-specific UI wording being spread across repositories

## 2. Module Ownership

### Auth
Owns:
- OAuth start/callback
- cookie issuance and clearing
- session/profile fetch
- refresh/logout behavior

Files typically live under:
- `backend/src/routes/auth.routes.ts`
- `backend/src/services/auth*.ts`
- auth helpers in `backend/src/lib`

### Recordings / Projects Domain
Owns:
- create/list/detail/update
- lifecycle state transitions
- project workspace data loading entry points

Current canonical API shape remains recording-backed even though the product is projects-first.

### Participants
Owns:
- host/guest participants
- display names/emails
- invite generation / claim behavior

### Uploads
Owns:
- upload contract generation
- multipart/presigned orchestration
- compatibility paths for older flows if still retained

### Project Assets
Owns:
- combined asset
- participant assets
- transcript asset relationships
- export artifact relationships
- project workspace graph assembly

### Analytics
Owns:
- summary metrics for dashboard
- aggregate counts/durations/dates

### Workers
Owns:
- stitch
- transcode
- ASR
- export
- maintenance

Workers must not become alternate HTTP controllers.

## 3. Route File Rules

Route files must be capability-scoped.

Preferred examples:
- `analytics.routes.ts`
- `auth.routes.ts`

Refactor target for recordings:
- `recordings.crud.routes.ts`
- `recordings.session.routes.ts`
- `recordings.assets.routes.ts`
- `recordings.chunks.routes.ts`

Each route file should do only:
- schema/DTO wiring
- auth guard use
- request parsing
- response/status mapping

## 4. Service Rules

Services are allowed to:
- coordinate repositories
- own domain invariants
- normalize backend response models
- call helper libraries

Services should avoid mixing:
- data loading
- asset-state calculation
- UI badge copy
- action-label generation

If a service grows into those responsibilities, split it.

## 5. Repository Rules

Repositories own:
- Prisma query construction
- joins / includes
- persistence-specific filtering and ordering

Repositories should not:
- emit UI-facing labels
- contain route auth decisions
- know about screen-level component behavior

## 6. Authorization Rules

Repeated owner/guest access checks must be extracted into shared helpers or service policies.

Do not keep copying inline conditions across route handlers.

## 7. Backend Refactor Priorities

Priority 1:
- split `recordings.routes.ts`

Priority 2:
- decompose `project-assets.service.ts` into:
  - query loader
  - state mapper
  - action builder
  - response assembler

Priority 3:
- consolidate auth/access helpers used across recordings/project routes

## 8. Commenting Requirements

Backend comments are required for:
- lifecycle transitions
- guest/owner access restrictions
- compatibility fallbacks
- worker retry/locking logic
- environment-specific behavior

Avoid comments that merely restate simple queries or assignments.
