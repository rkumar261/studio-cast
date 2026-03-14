# BRD/TRD 03 — Guest Access, Identity, Session Roles, and Permissions

Use this document as the implementation source for AI coding agents.

## Goal
Implement BRD/TRD 03 end-to-end for guest access, invite-bound identity, participant-scoped authorization, role-safe UI, upload permissions, and project visibility boundaries.

## Core principle
Guest participation must feel frictionless to the invitee while preserving strict backend ownership and authorization boundaries. Guests join via invite without account creation, but guest participation must **not** imply host ownership, project management rights, or automatic project visibility.

## Scope
This implementation wave covers:
- invite-bound guest bootstrap
- participant-scoped guest session/auth
- guest pre-join flow
- guest live-session join with scoped signaling/token issuance
- participant-scoped upload/track enforcement
- host vs guest UI capability boundaries
- guest project visibility boundaries
- guest access observability/audit
- QA and acceptance coverage

## Business and technical rules
- Guest join must work from invite URL **without product login**.
- Guest display name is **required**.
- Guest email is **optional** and must never block entry.
- Guest identity is invite-bound and session-scoped, not a reusable product account.
- Upload operations must be **participant-scoped**.
- Session/project management operations must remain **host-scoped**.
- Guest browsers must never receive generic owner-level credentials.
- Project page visibility for guests is **disabled by default** unless a separate host-controlled sharing capability is introduced later.
- Identity shown in UI must map directly to persisted participant records and generated assets.
- Progress/readiness must remain understandable and role-safe.

## Canonical role model
### Host
- authenticated product user
- owns studio, recording, project, invites, outputs, and sharing decisions

### Guest participant
- ephemeral invite-bound identity
- may join one session via invite
- may configure local devices
- may upload only local participant-owned tracks for that session
- may not manage project/session or access finished project by default

### Future collaborator/editor
- separate authenticated shared role
- out of scope for automatic guest participation

## Required implementation tasks

### 03-01 — Invite token lifecycle and guest bootstrap contract
Implement invite-bound guest entry.

Deliver:
- guest bootstrap endpoint(s)
- invite validation logic
- participant create/resolve logic
- participant-scoped guest session credential issuance
- invite status/audit persistence needed for revocation and tracing

Acceptance:
- guest can bootstrap from invite URL without product login
- invalid/expired/out-of-scope invite is rejected cleanly
- guest identity is bound to one recording/session only
- bootstrap does not grant project visibility or host rights

### 03-02 — Participant-scoped authorization layer
Implement dual-principal authorization:
- host user session
- participant-scoped guest session

Deliver:
- auth guard/policy layer that distinguishes host vs participant principals
- participant ownership enforcement on live upload routes
- owner-scope enforcement on session/project/admin actions
- blocked-attempt audit coverage

Acceptance:
- guest cannot register/upload/finalize/recover another participant's tracks or chunks
- host can manage all tracks/participants for owned recording
- blocked attempts are logged with traceable identifiers
- guest client never receives generic owner-level token

### 03-03 — Guest pre-join validation and bootstrap UX contract
Implement the no-login guest entry UI.

Deliver:
- guest welcome screen/state
- guest pre-join screen/state
- required name validation
- optional email flow
- bootstrap-to-studio flow using only session-scoped guest credential
- explicit "joining as guest" messaging

Acceptance:
- guest reaches session flow without login
- join blocked only until display name is provided
- email omission never blocks entry
- frontend stores only session-scoped guest credential

### 03-04 — Guest session join and scoped signaling/token issuance
Allow guests to join the live session using participant-scoped credentials.

Deliver:
- LiveKit/signaling/token routes that accept valid participant-scoped guest principals
- server-forced guest identity, participant ID, and role
- join/reconnect behavior using same scoped identity

Acceptance:
- guest joins live session without login via invite flow
- guest cannot join another recording or spoof participant/host role
- guest appears in session with clear guest identity and role
- reconnect does not broaden permission

### 03-05 — Participant-scoped upload and track enforcement across live routes
Audit and enforce participant ownership across the actual studio route set.

Deliver:
- consistent participant ownership checks on:
  - track register
  - chunk initiate
  - chunk complete
  - chunk recovery
  - track finalize
- host retains broader owner scope
- test coverage for own-track vs other-track behavior

Acceptance:
- guest uploads only own local tracks
- guest cannot finalize/recover another participant's track or chunks
- host flow continues to work
- authorization is consistent across all live-route families

### 03-06 — Host vs guest UI capability boundaries
Align in-session UI by role.

Deliver:
- participant cards/badges/control visibility by role
- guest-scoped UI with host-only controls hidden
- local device/upload state visible to local guest participant
- host view shows distinct participant cards with role badges and upload progress

Acceptance:
- guest UI does not expose host-only management controls
- guest still sees local-state/device/upload info
- host sees distinct participant cards with role badges and upload progress

### 03-07 — Project visibility boundaries for guests
Keep guest session participation separate from project access.

Deliver:
- guest cannot automatically open finished project page/assets after session completion
- guest completion/thanks UX acknowledges upload completion without implying project ownership/access
- permission notes remain compatible with future host-controlled sharing

Acceptance:
- guest completes upload flow without automatic project page access
- guest cannot access combined/participant assets by default after session unless separately shared
- host project ownership/sharing remains intact

### 03-08 — Guest access observability and audit
Add structured logging and diagnostics for guest access and authorization.

Deliver:
- audit events for invite validation, bootstrap accepted/rejected, participant-scoped auth issuance, join attempts, upload lifecycle events, blocked authorization attempts
- identifiers include recording_id, participant_id, actor type, and target identifiers where relevant
- readiness diagnostics remain role-safe and asset-aware

Acceptance:
- invite validation, guest join, and upload actions are traceable by recording and participant
- blocked authorization attempts include actor type and target identifiers
- logs support debugging without exposing raw secret values

### 03-09 — Guest/host role QA and acceptance matrix
Lock down behavior with tests and manual verification.

Deliver:
- automated tests for guest bootstrap, participant-scoped upload authorization, host-vs-guest route boundaries, forbidden cross-participant actions
- manual/browser verification checklist for invite flow, no-login join, upload-complete acknowledgement, host/guest UI capability differences
- acceptance report template or equivalent summary

Acceptance:
- guest joins via invite URL with required name and optional email without login
- guest cannot act on another participant's tracks/uploads or host-only controls
- host can trust asset attribution to correct participant identity and role
- guest upload completion and host participant-level progress are independently visible

## Implementation order
Work in this order unless current code strongly suggests a safer dependency order:
1. 03-01 Invite token lifecycle and guest bootstrap contract
2. 03-02 Participant-scoped authorization layer
3. 03-03 Guest pre-join validation and bootstrap UX contract
4. 03-04 Guest session join and scoped signaling/token issuance
5. 03-05 Participant-scoped upload and track enforcement across live routes
6. 03-06 Host vs guest UI capability boundaries
7. 03-07 Project visibility boundaries for guests
8. 03-08 Guest access observability and audit
9. 03-09 Guest/host role QA and acceptance matrix

## Required engineering rules
- Do not broaden guest capability implicitly.
- Do not redirect standard guests to login.
- Do not store owner-level credentials in guest clients.
- Do not trust client-provided participant ID, role, or host identity when issuing live-session tokens.
- Do not expose host-only controls in guest UI.
- Do not automatically grant project visibility to guests after upload/session completion.
- Keep changes backward-compatible for host flows unless the requirement explicitly changes host behavior.
- Prefer minimal invasive changes that complete the existing architecture.

## Files/areas the agent must inspect first
- backend Prisma schema
- invite/bootstrap/auth guard/policy code
- recording/session/participant routes and services
- live routes: track register, chunk initiate/complete/recovery, finalize
- LiveKit/signaling/token issuance routes
- frontend invite/welcome/pre-join flow
- frontend studio People panel / participant cards / upload status
- guest leave/thanks/upload-complete flow
- project visibility and route guards
- observability/audit/logging code
- existing guest/upload/auth tests

## Required output from the AI agent
1. Compliance matrix for 03-01 through 03-09:
   - Implemented
   - Partially implemented
   - Missing
2. Minimal implementation plan
3. Code changes
4. Tests added/updated
5. Final verification summary with remaining risks or intentional deferrals

## Definition of done
BRD/TRD 03 is complete only when:
- guest invite flow is no-login, invite-bound, and role-safe
- guest identity is participant-scoped and enforced across live routes
- host/guest UI capability boundaries are correct
- guests do not gain project access by default
- audit/logging is sufficient to trace guest join and blocked authorization attempts
- automated and manual verification cover allowed and forbidden paths
