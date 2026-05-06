# Request Flows

This document explains the major request flows that future work must preserve.

## 1. Login Flow

1. Browser lands on `/`
2. Middleware checks routing UX cookies/markers
3. Signed-out users are rewritten to `/landing`
4. User starts Google OAuth
5. Backend callback issues cookies
6. Frontend session-marker and post-auth redirect behavior restore intended destination

Important invariant:
- deep-link intent must be preserved for protected routes like `/projects/[id]`

## 2. Home Load Flow

1. Authenticated user loads `/`
2. Workspace shell renders
3. Home hook loads:
   - recent recordings/projects
   - analytics summary
   - dashboard CTA state
4. User can open projects, upload, or jump to AI/transcript-related surfaces

## 3. Project Workspace Load Flow

1. User loads `/projects/[id]`
2. Frontend fetches:
   - recording detail
   - progress/state
   - project asset graph
3. View-model hook shapes:
   - page header/title
   - preview state
   - track rows
   - artifact rows
   - transcript panel state
4. Polling continues while processing is incomplete

Important invariant:
- the page remains the operational center for preview, tracks, transcript, and exports

## 4. Upload Flow

1. User enters `/projects/new?mode=upload`
2. Browser creates a draft recording-backed project shell
3. Browser requests multipart/presigned upload contract
4. Browser uploads file parts directly to storage
5. Browser completes upload
6. User is redirected to `/projects/[id]`

Important invariant:
- active user-facing flow is presigned multipart, not legacy TUS

## 5. Studio Host Flow

1. Host opens `/studio/[recordingId]`
2. Device and session hooks initialize
3. Host enters pre-join / prepared state
4. Recording starts
5. Local media/chunking/upload orchestration runs
6. Recording stops
7. Upload finalization completes
8. User later views `/projects/[id]` for processing and outputs

## 6. Studio Guest Flow

1. Guest receives invite link
2. Guest enters studio route / claim flow
3. Session and device readiness initialize
4. Guest records/uploads participant media
5. Guest upload state feeds project processing state

## 7. Transcript Flow

1. ASR worker generates transcript/revisions
2. Project workspace loads transcript metadata and segments
3. User reviews, searches, edits, and publishes transcript
4. Captions/exports can consume published transcript data

## 8. Analytics Flow

1. Home loads analytics summary endpoint
2. Backend aggregates project counts, recorded minutes, and latest activity
3. Dashboard analytics panel renders real values or falls back cleanly if unavailable
