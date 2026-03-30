# Frontend Dashboard + Project Workspace Redesign Plan

## Document Goal

This document is the implementation plan for the Studio Cast authenticated UI redesign.

It is written to be directly usable by another engineer or coding agent. It defines:

- product information architecture
- target route model
- page responsibilities
- component architecture
- file-level implementation targets
- migration sequence from the current UI to the new UI
- unit test coverage plan
- Playwright automation plan
- acceptance criteria and rollout checkpoints

This plan is intentionally detailed and decision-complete for the first redesign wave.

---

## 1. Product Goal

Studio Cast should move from a collection of disconnected pages into a cohesive authenticated workspace modeled after the Riverside-style screenshots shared by the user.

The new authenticated experience should have three clear layers:

1. `Home`
   - dashboard and discovery
   - quick-start actions
   - recent work
   - analytics and promotional modules

2. `Project`
   - the main workspace for one recording/project
   - contains all video/recording-related actions
   - becomes the canonical detail route

3. `All Recordings`
   - a minimal archive/index page
   - not a primary workspace
   - used only for browsing the full set of recordings

The current recordings detail experience should be replaced by a canonical project workspace route.

---

## 2. Final Information Architecture

### 2.1 Canonical authenticated routes

- `/`
  - signed out: existing marketing/landing page
  - signed in: new dashboard home

- `/projects/[id]`
  - new canonical project workspace
  - this is the main page for all recording/video-related work

- `/recordings`
  - simplified all-recordings archive page
  - only lists all recordings with minimal metadata and a way to open the project

- `/recordings/[id]`
  - temporary compatibility route
  - should redirect to `/projects/[id]`

### 2.2 Studio-related routes

These remain functionally intact during this wave:

- `/start`
- `/tech-check`
- `/studio/[recordingId]`
- `/studio/[recordingId]/thanks`

They can be visually harmonized later, but they are not the main refactor target for this redesign wave.

---

## 3. Product Decisions Locked For This Wave

### 3.1 Project route naming

The URL must reflect the page purpose:

- use `projects` for the workspace route
- do not keep using `recordings/[id]` as the main user-facing detail route

### 3.2 Recording list page scope

The recording list page is still useful, but only as a thin utility page.

It should not contain:

- full asset diagnostics
- transcript/export blocks
- participant processing detail
- the primary working experience

It should only provide:

- all recordings list
- search/filter/sort if needed
- minimal metadata
- one direct CTA: open project

### 3.3 Project page ownership

The new project page must contain the actual working surface for a recording.

It should include:

- hero preview/player
- primary actions
- participant/track outputs
- transcript/captions/exports
- processing and blocked states
- recording-related CTAs
- a compact recordings section with an `All recordings` button

### 3.4 Home page ownership

The new logged-in home page should match the user-shared dashboard screenshots.

It should include, in order:

1. dashboard shell
2. search
3. promo strip
4. quick action hero
5. recents
6. analytics section
7. AI tools section

This is not a generic dashboard. It should follow the screenshot composition closely.

---

## 4. Existing Frontend State

### 4.1 Current important files

- `frontend/src/app/page.tsx`
  - mixes signed-out marketing and signed-in home/dashboard logic

- `frontend/src/app/recordings/page.tsx`
  - current recordings list page
  - currently too dense and too close to a detail page

- `frontend/src/app/recordings/[id]/page.tsx`
  - current per-recording detail page
  - currently the closest thing to a project page

- `frontend/src/components/Navbar.tsx`
  - current global header for non-studio pages
  - does not fit the new workspace shell

- `frontend/src/app/layout.tsx`
  - wraps pages with `Navbar`

- `frontend/src/app/globals.css`
  - currently minimal and not a real design-token layer

- `frontend/src/app/studio/[recordingId]/page.tsx`
  - extremely large studio page
  - should not be deeply refactored in this redesign wave

### 4.2 Current testing setup

Existing frontend test tooling:

- Jest is configured
- utility tests already exist under `frontend/__test__/lib/...`

Not present yet:

- Playwright
- UI-level page automation
- component-focused tests for dashboard/project surfaces

This means the plan should extend the existing Jest approach and add Playwright from scratch.

---

## 5. Target UI System

### 5.1 Global shell

Create one reusable authenticated shell used by:

- Home
- Project page
- All recordings page

The shell should include:

- fixed left vertical rail
- top centered search area
- optional utility/status region
- large rounded content canvas
- shared dark surface system

### 5.2 Design tokens

Introduce semantic tokens in `globals.css` or a dedicated theme layer:

- background
- shell background
- canvas background
- card background
- elevated card background
- border default
- border emphasis
- text primary
- text secondary
- text muted
- accent purple
- accent red
- accent green
- accent lime
- radius scale
- spacing scale

The design language should be uniform across all authenticated surfaces.

### 5.3 Typography

Adopt a single font system for the dashboard surfaces.

Decision:

- use a deliberate product font for authenticated surfaces
- do not keep Arial/system-only styling for the dashboard

Recommended operational rule:

- dashboard, project, and recordings pages share one font setup
- studio page may stay on its existing font short-term if migration cost is too high

---

## 6. Target Route Map and Page Responsibilities

## 6.1 `/` signed-in home

This page becomes the primary dashboard.

Required sections:

1. workspace shell frame
2. search
3. promo banner
4. quick action hero
5. recents
6. analytics + podcast setup/import panel
7. AI tools cards

Home page actions:

- Record
- Edit
- Go live
- Schedule
- Upload

Home recents:

- cards with thumbnail
- title
- metadata
- direct actions such as play/edit/open project

Home should link into:

- `/projects/[id]`
- `/recordings`
- studio flows where needed

## 6.2 `/projects/[id]`

This becomes the canonical workspace page.

Required content blocks:

1. project header
2. tabs or segmented navigation for project-level content
3. hero preview/player
4. actions row
5. recordings strip or recordings subsection
6. tracks/participants section
7. transcript/captions/exports section
8. processing and blocked-state messaging

This page must be the place where the user performs all recording/video-related actions.

Examples of actions expected here:

- preview/open media
- download
- share
- copy transcript
- export-related actions
- open in studio or continue processing-related actions

## 6.3 `/recordings`

This becomes a utility archive page only.

Allowed responsibilities:

- show all recordings
- allow search
- allow sort/filter if needed
- show minimal metadata
- link to `/projects/[id]`

Disallowed responsibilities:

- major diagnostics
- transcript or export operations inline
- participant output breakdown
- acting as the canonical work page

## 6.4 `/recordings/[id]`

This should become a redirect route:

- read the ID
- redirect to `/projects/[id]`

This preserves old links and bookmarks while moving users to the correct route shape.

---

## 7. Proposed File and Folder Changes

## 7.1 New route files

Use Next.js App Router **route groups** (decision 13.1):

```
frontend/src/app/
├── (public)/
│   ├── layout.tsx        ← Navbar only
│   └── page.tsx          ← signed-out marketing only
├── (authenticated)/
│   ├── layout.tsx        ← WorkspaceShell (sidebar + canvas)
│   ├── page.tsx          ← signed-in dashboard home
│   ├── projects/
│   │   └── [id]/page.tsx ← new canonical project workspace
│   └── recordings/
│       └── page.tsx      ← archive page
└── recordings/
    └── [id]/page.tsx     ← redirect only (outside groups)
```

Add:

- `frontend/src/app/(authenticated)/projects/[id]/page.tsx`
  - new canonical project workspace
- `frontend/src/middleware.ts`
  - auth-based redirect at `/` (decision 13.2)

Keep (moved into route group):

- `frontend/src/app/(authenticated)/recordings/page.tsx`
  - rewrite as thin archive page

Replace behavior of:

- `frontend/src/app/recordings/[id]/page.tsx`
  - redirect to `/projects/[id]` with param guard (decision 13.5)

## 7.2 New shared UI areas

Add new folders:

- `frontend/src/components/dashboard/`
- `frontend/src/components/projects/`
- `frontend/src/components/workspace/`

Suggested component inventory:

### `components/workspace/`

Implement in wave 1 (structural logic):

- `WorkspaceShell.tsx`
- `WorkspaceSidebar.tsx`
- `WorkspaceSearchBar.tsx`
- `WorkspacePromoBanner.tsx`
- `WorkspaceTabs.tsx`

Deferred — use inline Tailwind until pattern appears in 3+ places (decision 13.6):

- ~~`WorkspaceSectionHeader.tsx`~~ — inline `h2`
- ~~`WorkspaceStatusPill.tsx`~~ — inline `span`
- ~~`WorkspaceIconButton.tsx`~~ — inline `button`
- ~~`WorkspaceCard.tsx`~~ — inline `div`

### `components/dashboard/`

- `DashboardQuickActions.tsx`
- `DashboardRecentGrid.tsx`
- `DashboardRecentCard.tsx`
- `DashboardAnalyticsPanel.tsx`
- `DashboardPodcastCta.tsx`
- `DashboardAiToolsRail.tsx`
- `DashboardAiToolCard.tsx`

### `components/projects/`

- `ProjectHeader.tsx`
- `ProjectHeroPreview.tsx`
- `ProjectActionBar.tsx`
- `ProjectRecordingsRail.tsx`
- `ProjectRecordingMiniCard.tsx`
- `ProjectTracksPanel.tsx`
- `ProjectTrackRow.tsx`
- `ProjectArtifactsPanel.tsx`
- `ProjectArtifactRow.tsx`
- `ProjectProcessingBanner.tsx`

## 7.3 New view-model hooks and shared types

These must be React hooks (not plain `.ts` adapters) because they own polling state (decision 13.3):

- `frontend/src/lib/dashboard/useHomeViewModel.ts`
- `frontend/src/lib/projects/useProjectWorkspace.ts`
  - owns single polling interval for `getProgress` + `getProjectAssets` in parallel
- `frontend/src/lib/projects/useProjectRecordings.ts`

Add shared card type first (decision 13.4):

- `frontend/src/lib/recording-card-view-model.ts`
  - defines `RecordingCardViewModel` — imported by all three hooks above
  - reuses `toConsumerStateLabel` from `lib/recording-journey.ts`

These convert raw API responses into page-friendly shapes. Presentational components receive stable view-model objects as props — no API or polling logic in JSX.

---

## 8. Detailed Step-by-Step Implementation Plan

## Phase 0: Baseline and prep

### Step 0.1

Create a snapshot branch for the redesign work.

### Step 0.2

Audit and document all current links that point to:

- `/recordings`
- `/recordings/[id]`
- `/studio/[recordingId]`

### Step 0.3

Identify all places that create or open recordings and note their current destination.

Must verify in:

- `frontend/src/app/page.tsx`
- `frontend/src/app/recordings/page.tsx`
- `frontend/src/components/CreateRecordingForm.tsx`
- `frontend/src/app/studio/[recordingId]/page.tsx`
- `frontend/src/app/studio/[recordingId]/thanks/page.tsx`

### Step 0.4

Capture before-state screenshots for:

- signed-in home
- recordings list
- recordings detail
- post-recording return path

These become visual regression references.

---

## Phase 1: Shell and token foundation

### Step 1.1

Set up route group structure and middleware.

Actions:

1. Create `app/(public)/layout.tsx` — wraps with `<Navbar />` only
2. Create `app/(authenticated)/layout.tsx` — wraps with `<WorkspaceShell />`
3. Strip `<Navbar />` from `app/layout.tsx` — root layout becomes shell-only (`<SessionProvider>`, `<main>`)
4. Add `src/middleware.ts` — cookie presence check redirects `/` based on auth state

This eliminates per-page shell boilerplate. All authenticated pages get the shell automatically via the route group layout.

### Step 1.2

Refactor `frontend/src/components/Navbar.tsx`.

Decision:

- narrow to public navigation only — used exclusively by `(public)/layout.tsx`
- no top navbar on any authenticated workspace page (shell has sidebar instead)

### Step 1.3

Extend `frontend/src/app/globals.css`.

Add:

- dark workspace color tokens
- spacing/radius tokens
- shared surface helpers
- typography variables
- animation rules for subtle dashboard transitions

### Step 1.4

Create the reusable workspace shell components.

Implement first:

- sidebar
- search
- promo bar
- content frame

Do not yet wire them to all pages.

---

## Phase 2: Home page redesign

### Step 2.1

Split `frontend/src/app/page.tsx` into two compositions:

- signed-out marketing
- signed-in dashboard

### Step 2.2

Move the signed-in dashboard rendering into reusable dashboard components.

Required output structure:

- `WorkspaceShell`
- `DashboardQuickActions`
- `DashboardRecentGrid`
- `DashboardAnalyticsPanel`
- `DashboardAiToolsRail`

### Step 2.3

Map current `RecordingsAPI.listMine(6)` response to dashboard recents.

Rules:

- recents should point to `/projects/[id]`
- cards should expose the most useful action for the state

### Step 2.4

Implement screenshot-aligned quick action hero.

Important:

- actions must be visually centered
- action circles must use consistent sizing
- `Record` is visually primary

### Step 2.5

Implement analytics and podcast CTA block.

If backend analytics data does not exist:

- use placeholder or derived metrics
- keep the component shape production-ready
- clearly separate real metrics slots from placeholder content

### Step 2.6

Implement AI tools cards section.

This section is mostly presentational in wave 1.

Use:

- static data or config-driven card list
- no backend dependency required for first pass

### Step 2.7

Add direct navigation from home:

- recents -> `/projects/[id]`
- archive button -> `/recordings`

---

## Phase 3: Canonical project route creation

### Step 3.1

Create `frontend/src/app/projects/[id]/page.tsx`.

This file should become the real project workspace route.

### Step 3.2

Move the data-loading strategy from the current recordings detail page into project-specific adapters/hooks.

Use existing APIs:

- `RecordingsAPI.getById`
- `RecordingsAPI.getProgress`
- `RecordingsAPI.getProjectAssets`

### Step 3.3

Create `ProjectWorkspaceViewModel`.

This adapter must transform:

- recording header data
- primary preview state
- participant assets
- transcript/captions
- export rows
- processing summary

into smaller UI-ready models.

### Step 3.4

Build the new project layout around these blocks:

1. project header
2. tabs
3. hero preview
4. primary actions
5. recordings subsection
6. tracks subsection
7. artifacts subsection

### Step 3.5

Add the recordings subsection to the project page.

This must include:

- small set of recordings or recent recordings
- minimal cards/rows
- `All recordings` button linking to `/recordings`

The goal is to give contextual access to nearby work without turning the page into a full archive.

### Step 3.6

Move all key recording/video actions onto the project page.

Examples:

- playback preview
- open/download media
- copy transcript
- export access
- participant output actions

### Step 3.7

Compress diagnostics-heavy content into denser rows and banners.

Current issue:

- the existing detail page is too verbose

Target:

- preserve the same state visibility
- reduce scan cost
- make the page feel like a workspace, not an internal support tool

### Step 3.8

Keep polling behavior, but isolate it from layout components.

Recommendation:

- page hook owns polling
- presentational components receive stable view-models

---

## Phase 4: Recordings archive simplification

### Step 4.1

Rewrite `frontend/src/app/recordings/page.tsx`.

This page must become:

- lighter
- flatter
- archive-oriented

### Step 4.2

Remove heavy per-card summary blocks.

Replace with:

- title
- created timestamp
- primary state
- maybe one small secondary metric
- `Open project` CTA

### Step 4.3

Decide whether create-new-recording lives here.

Recommended:

- keep a compact create button
- do not make creation the visual focal point of the page
- creation is primarily initiated from Home

### Step 4.4

Keep this page aligned with the workspace shell but less dense than the project page.

---

## Phase 5: Route migration and compatibility

### Step 5.1

Change all app links that currently open recording detail.

Update destinations from:

- `/recordings/[id]`

to:

- `/projects/[id]`

### Step 5.2

Add compatibility redirect in `frontend/src/app/recordings/[id]/page.tsx`.

This route should:

- accept the recording ID
- guard against undefined param: if no ID, redirect to `/recordings`
- redirect to `/projects/[id]`

```tsx
import { redirect } from 'next/navigation';

export default function RecordingDetailRedirect({ params }: { params: { id?: string } }) {
  if (!params.id) redirect('/recordings');
  redirect(`/projects/${params.id}`);
}
```

### Step 5.3

Update post-recording return flows.

Check and update:

- studio stop/finish transitions
- thanks page navigation
- any “open details” buttons

### Step 5.4

Update dashboard recents and any internal CTA labels to use `Open project` rather than `Open details`.

---

## Phase 6: Testing plan

## 6.1 Unit testing strategy

Use the existing Jest setup and extend it.

### New unit test targets

Add tests for:

- dashboard home view-model adapters
- project workspace view-model adapters
- route/CTA mapping logic
- status-to-pill mapping
- section visibility rules
- archive page list shaping

Suggested files:

- `frontend/__test__/lib/dashboard/home-view-model.test.ts`
- `frontend/__test__/lib/projects/project-view-model.test.ts`
- `frontend/__test__/lib/projects/project-recordings-view-model.test.ts`
- `frontend/__test__/lib/ui/status-pill-mapping.test.ts`

### Unit test scenarios

For home:

- signed-in user with no recordings
- signed-in user with multiple recordings
- recent cards map to `/projects/[id]`
- action availability based on recording state

For project:

- ready project produces hero preview and actionable rows
- processing project produces placeholder/processing state
- blocked project produces warning messaging
- no participant assets state renders correctly
- transcript/export rows map actions correctly

For recordings archive:

- list items remain minimal
- item actions always route to project

## 6.2 Component-level testing strategy

If component tests are added under Jest + jsdom:

- `WorkspaceSidebar`
- `DashboardQuickActions`
- `ProjectTrackRow`
- `ProjectArtifactRow`
- `WorkspaceTabs`

Test:

- render conditions
- active state
- labels
- button enable/disable behavior

---

## 7. Playwright automation plan

Playwright should be added in this wave.

## 7.1 Tooling additions

Add:

- Playwright dependency
- `playwright.config.ts`
- `frontend/e2e/` directory
- npm scripts in `frontend/package.json`

Suggested scripts:

- `test:e2e`
- `test:e2e:ui`
- `test:e2e:headed`

## 7.2 Base Playwright coverage

Create initial specs for:

### `frontend/e2e/home.spec.ts`

Scenarios:

- signed-out user sees marketing home
- signed-in user sees dashboard shell
- quick actions visible
- recents visible
- analytics and AI tools sections visible

### `frontend/e2e/project.spec.ts`

Scenarios:

- open `/projects/[id]`
- hero preview section exists
- recordings subsection exists
- `All recordings` button navigates to `/recordings`
- tracks section renders
- transcript/export section renders

### `frontend/e2e/recordings-archive.spec.ts`

Scenarios:

- archive page renders a simplified list
- selecting an item navigates to `/projects/[id]`
- no heavy diagnostics appear inline

### `frontend/e2e/recording-redirect.spec.ts`

Scenarios:

- visiting `/recordings/[id]` redirects to `/projects/[id]`

## 7.3 Playwright test data strategy

Recommended approach:

- seed or mock authenticated API responses for stable UI states
- include fixtures for:
  - empty home
  - home with recent recordings
  - project ready
  - project processing
  - project blocked
  - archive list with multiple recordings

If direct backend seeding is not ready, use network mocking in Playwright for the first wave.

## 7.4 Playwright regression checklist

Automate:

- route transitions
- nav state
- action button visibility
- recording detail redirect behavior
- presence of critical sections
- basic responsive checks at desktop and tablet widths

---

## 8. File-by-File Change Plan

## 8.1 Files to modify

- `frontend/src/app/layout.tsx`
  - remove `<Navbar />` — shell ownership moves to route group layouts

- `frontend/src/components/Navbar.tsx`
  - narrow to public navigation only (used by `(public)/layout.tsx`)

- `frontend/src/app/globals.css`
  - add token layer and workspace helpers

- `frontend/src/app/recordings/[id]/page.tsx`
  - replace with redirect + param guard (decision 13.5):
    `if (!params.id) redirect('/recordings'); redirect('/projects/' + params.id)`

- `frontend/package.json`
  - add Playwright scripts and dependencies

- `frontend/next.config.ts`
  - optionally add allowed dev origin settings if ngrok/dev workflow is still used

**Note:** `frontend/src/app/page.tsx` and `frontend/src/app/recordings/page.tsx` are effectively replaced by their route-group counterparts — do not modify in place, move into route groups.

## 8.2 Files to add

### Middleware + route group layouts

- `frontend/src/middleware.ts`
  - cookie presence check → redirect `/` based on auth (decision 13.2)
- `frontend/src/app/(public)/layout.tsx`
  - wraps public pages with `<Navbar />`
- `frontend/src/app/(public)/page.tsx`
  - signed-out marketing page (moved from `app/page.tsx`)
- `frontend/src/app/(authenticated)/layout.tsx`
  - wraps authenticated pages with `<WorkspaceShell />`
- `frontend/src/app/(authenticated)/page.tsx`
  - signed-in dashboard home
- `frontend/src/app/(authenticated)/projects/[id]/page.tsx`
  - new canonical project workspace
- `frontend/src/app/(authenticated)/recordings/page.tsx`
  - simplified archive page

### Shared type (add first)

- `frontend/src/lib/recording-card-view-model.ts`
  - `RecordingCardViewModel` type (decision 13.4)

### Shell/components (wave 1 only — decision 13.6)

- `frontend/src/components/workspace/WorkspaceShell.tsx`
- `frontend/src/components/workspace/WorkspaceSidebar.tsx`
- `frontend/src/components/workspace/WorkspaceSearchBar.tsx`
- `frontend/src/components/workspace/WorkspacePromoBanner.tsx`
- `frontend/src/components/workspace/WorkspaceTabs.tsx`

### Home modules

- `frontend/src/components/dashboard/DashboardQuickActions.tsx`
- `frontend/src/components/dashboard/DashboardRecentGrid.tsx`
- `frontend/src/components/dashboard/DashboardRecentCard.tsx`
- `frontend/src/components/dashboard/DashboardAnalyticsPanel.tsx`
  - slot-based props, "Coming soon" badge when `data` is undefined (decision 13.7)
- `frontend/src/components/dashboard/DashboardPodcastCta.tsx`
- `frontend/src/components/dashboard/DashboardAiToolsRail.tsx`
- `frontend/src/components/dashboard/DashboardAiToolCard.tsx`

### Project modules

- `frontend/src/components/projects/ProjectHeader.tsx`
- `frontend/src/components/projects/ProjectHeroPreview.tsx`
- `frontend/src/components/projects/ProjectActionBar.tsx`
- `frontend/src/components/projects/ProjectRecordingsRail.tsx`
- `frontend/src/components/projects/ProjectRecordingMiniCard.tsx`
- `frontend/src/components/projects/ProjectTracksPanel.tsx`
- `frontend/src/components/projects/ProjectTrackRow.tsx`
- `frontend/src/components/projects/ProjectArtifactsPanel.tsx`
- `frontend/src/components/projects/ProjectArtifactRow.tsx`
- `frontend/src/components/projects/ProjectProcessingBanner.tsx`

### View-model hooks (decision 13.3)

- `frontend/src/lib/dashboard/useHomeViewModel.ts`
- `frontend/src/lib/projects/useProjectWorkspace.ts`
- `frontend/src/lib/projects/useProjectRecordings.ts`

### Unit tests

- `frontend/__test__/lib/dashboard/useHomeViewModel.test.ts`
- `frontend/__test__/lib/projects/useProjectWorkspace.test.ts`
- `frontend/__test__/lib/projects/useProjectRecordings.test.ts`
- `frontend/__test__/lib/recording-card-view-model.test.ts`

### Playwright (decision 13.8)

- `frontend/playwright.config.ts`
- `frontend/e2e/fixtures/auth.ts` — `mockAuthedSession()` helper
- `frontend/e2e/fixtures/empty-home.json`
- `frontend/e2e/fixtures/home-with-recents.json`
- `frontend/e2e/fixtures/project-ready.json`
- `frontend/e2e/fixtures/project-processing.json`
- `frontend/e2e/fixtures/archive-list.json`
- `frontend/e2e/home.spec.ts`
- `frontend/e2e/project.spec.ts`
- `frontend/e2e/recordings-archive.spec.ts`
- `frontend/e2e/recording-redirect.spec.ts`

---

## 9. UX and Visual Rules To Preserve During Implementation

### Home page

- quick actions must feel centered and dominant
- recents must be immediately scannable
- analytics and AI sections must read as first-class modules
- page should not become an overloaded admin dashboard

### Project page

- preview must be above-the-fold
- actions must be visible without hunting
- processing states must be obvious but compact
- project page should feel like the destination, not a diagnostic page

### Archive page

- should feel simpler than the project page
- should support scale
- should not compete with the project page for attention

---

## 10. Risk List

## 10.1 UX risks

- over-cloning the screenshot without preserving Studio Cast’s actual workflow needs
- hiding important processing states while simplifying the project page
- making the archive too light and losing findability

## 10.2 Technical risks

- broken internal links after moving to `/projects/[id]`
- stale references still pointing to `/recordings/[id]`
- current polling logic causing unnecessary rerenders in the new workspace
- large presentational components becoming another monolith if adapters are not created

## 10.3 Testing risks

- lack of stable auth test setup for Playwright
- brittle selectors if the new UI is built without test IDs or accessible names

Mitigation:

- define test-friendly labels and data attributes during implementation
- centralize route generation helpers

---

## 11. Acceptance Criteria

The redesign is complete when all of the following are true:

### Home

- signed-in home visually matches the target Riverside-style composition
- recents open projects, not recordings detail
- analytics and AI tools sections exist and behave consistently

### Project

- `/projects/[id]` is the canonical detail route
- it contains all major recording/video actions
- it includes a recordings subsection and an `All recordings` button
- it preserves preview, participant outputs, transcript, captions, exports, and processing state visibility

### Recordings archive

- `/recordings` is simplified into an archive page
- it does not act like the primary workspace

### Compatibility

- `/recordings/[id]` redirects to `/projects/[id]`
- old links still land the user in the correct place

### Quality

- unit tests added for new view-model logic
- Playwright coverage added for core navigation and page rendering
- responsive behavior validated at desktop and tablet minimum

---

## 12. Recommended Delivery Order

The implementation should be delivered in this exact order:

1. route group structure + middleware (`(public)/`, `(authenticated)/`, `middleware.ts`)
2. shared type (`lib/recording-card-view-model.ts`)
3. shell and tokens (`WorkspaceShell`, `WorkspaceSidebar`, `WorkspaceSearchBar`, `WorkspaceTabs`, `globals.css` tokens)
4. home page redesign (`(authenticated)/page.tsx` + dashboard components + `useHomeViewModel`)
5. project route creation (`(authenticated)/projects/[id]/page.tsx`)
6. project workspace redesign (project components + `useProjectWorkspace`)
7. recordings archive simplification (`(authenticated)/recordings/page.tsx`)
8. route redirect and link cleanup (`recordings/[id]/page.tsx` redirect, update all CTAs)
9. unit tests
10. Playwright setup + fixtures
11. Playwright coverage for home/project/archive/redirect
12. final regression pass

This ordering minimizes broken navigation and avoids mixing route migration with studio-runtime refactors.

---

## 13. Architectural Decisions (from Eng Review — 2026-03-30)

These decisions were locked during `/plan-eng-review` and must be followed during implementation.

### 13.1 Route groups — authenticated vs public shell

Use Next.js App Router **route groups** instead of per-page shell composition.

```
frontend/src/app/
├── (public)/
│   ├── layout.tsx        ← Navbar only (signed-out top nav)
│   └── page.tsx          ← signed-out marketing page only
├── (authenticated)/
│   ├── layout.tsx        ← WorkspaceShell (sidebar, search, canvas)
│   ├── page.tsx          ← signed-in dashboard home
│   ├── projects/
│   │   └── [id]/page.tsx ← canonical project workspace
│   └── recordings/
│       └── page.tsx      ← archive page
└── recordings/
    └── [id]/page.tsx     ← redirect only (stays outside groups)
```

**Why:** Route groups give the shell automatically to all authenticated pages with zero per-page boilerplate. Without this, `WorkspaceShell` would be a DRY violation repeated in every page component.

Section 5.1 (Global shell) and Phase 1 (Step 1.1–1.4) must be implemented using this structure.

---

### 13.2 Middleware auth redirect — no client-side flash

Add `frontend/src/middleware.ts` at the repo root to handle the `/` auth split.

```ts
// middleware.ts — presence check only (wave 1)
// See TODOS.md: "Harden middleware auth check" for JWT verify upgrade.
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const isAuthed = !!req.cookies.get('access_token');
  const { pathname } = req.nextUrl;

  if (pathname === '/' && isAuthed) {
    return NextResponse.redirect(new URL('/(authenticated)', req.url));
  }
  if (pathname.startsWith('/(authenticated)') && !isAuthed) {
    return NextResponse.redirect(new URL('/', req.url));
  }
}

export const config = {
  matcher: ['/', '/(authenticated)/:path*'],
};
```

**Wave 1:** cookie presence check only.
**TODO (deferred):** JWT signature verify using `jose` — see TODOS.md.

Replaces the per-page `RequireAuth` wrapper for all authenticated routes.

---

### 13.3 View-model files must be hooks, not plain TS adapters

The plan lists these as plain `.ts` files:
- `lib/dashboard/home-view-model.ts`
- `lib/projects/project-view-model.ts`
- `lib/projects/project-recordings-view-model.ts`

**Decision:** Rename and implement as React hooks:
- `lib/dashboard/useHomeViewModel.ts`
- `lib/projects/useProjectWorkspace.ts`
- `lib/projects/useProjectRecordings.ts`

`useProjectWorkspace` owns polling (single `setInterval` fetching both `getProgress` and `getProjectAssets` in parallel). Presentational components receive stable view-model objects as props — no polling logic leaks into components.

---

### 13.4 Shared RecordingCardViewModel type

Add `frontend/src/lib/recording-card-view-model.ts` before building any dashboard or project component.

```ts
export type RecordingCardViewModel = {
  id: string;
  title: string;
  href: string;          // always /projects/[id]
  state: 'ready' | 'processing' | 'error' | 'draft';
  durationLabel?: string;
  thumbnailUrl?: string;
  primaryAction?: { label: string; href: string };
};
```

All three hooks (`useHomeViewModel`, `useProjectWorkspace`, `useProjectRecordings`) import and return this type for recording card data. Reuse `toConsumerStateLabel` from `lib/recording-journey.ts` for the `state` field.

---

### 13.5 Redirect guard — /recordings/[id]

```tsx
// frontend/src/app/recordings/[id]/page.tsx
import { redirect } from 'next/navigation';

export default function RecordingDetailRedirect({ params }: { params: { id?: string } }) {
  if (!params.id) redirect('/recordings');   // guard against undefined
  redirect(`/projects/${params.id}`);
}
```

**Critical gap fixed:** Without the guard, a missing param produces a silent redirect to `/projects/undefined`.

---

### 13.6 Component scope reduction

The following components from Section 7.2 should **not** be extracted as standalone files in wave 1. Use inline Tailwind instead. Extract only if the pattern appears in 3+ distinct locations.

Deferred:
- `WorkspaceCard` — inline `div` with Tailwind
- `WorkspaceIconButton` — inline `button` with Tailwind
- `WorkspaceSectionHeader` — inline `h2` with Tailwind
- `WorkspaceStatusPill` — inline `span` with Tailwind

Implement as standalone components in wave 1:
- `WorkspaceShell`, `WorkspaceSidebar`, `WorkspaceSearchBar`, `WorkspaceTabs`, `WorkspacePromoBanner`

---

### 13.7 DashboardAnalyticsPanel — slot-based with preview badge

```tsx
type AnalyticsSummaryData = {
  totalMinutesRecorded: number;
  episodeCount: number;
  lastRecordingAt: string;
};

// Props: data is optional. When absent, renders "Coming soon" badge.
function DashboardAnalyticsPanel({ data }: { data?: AnalyticsSummaryData }) { ... }
```

**Wave 1:** always renders with `data={undefined}` → "Coming soon" badge.
**TODO (deferred):** Wire to `/v1/analytics/summary` — see TODOS.md.

---

### 13.8 Playwright auth — page.route() mocking

All signed-in Playwright specs use `page.route()` to mock API responses. No real backend required.

```ts
// e2e/fixtures/auth.ts
export async function mockAuthedSession(page: Page) {
  await page.route('/auth/me', (route) =>
    route.fulfill({ json: { user: { id: 'u1', email: 'test@example.com', name: 'Test User' } } })
  );
}
```

Fixture files required (create in `e2e/fixtures/`):
- `empty-home.json` — `listMine` returns `{ items: [] }`
- `home-with-recents.json` — `listMine` returns 3 recording items
- `project-ready.json` — `getById` + `getProjectAssets` with ready state
- `project-processing.json` — `getProjectAssets` with processing state
- `archive-list.json` — `listMine` returns full list

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAN | 5 issues, 1 critical gap fixed |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |

**VERDICT: ENG CLEARED — ready to implement.**
