# BRD 10 — Cloud-Native Media Persistence, Participant Final Assets, and Combined Output Delivery

## Document status
Draft for implementation planning

## Purpose
Define the product behavior and business requirements needed to complete the recording flow so that:
- participant media is durably persisted to blob/object storage
- final participant assets are generated and available by URL
- final combined output is generated and available by URL
- local server storage is treated as transient working space only
- the client can reliably watch or download each participant output and the combined output after processing

This BRD closes the current gap where media is not reliably visible in cloud storage after recording stop, and where durable cloud media availability depends too heavily on local-first processing assumptions.

---

## Problem statement
The current flow records media in the browser and uploads chunk data through the backend, but the durable storage and final-delivery path is not strong enough for production expectations.

Observed product gap:
- participants record in studio
- recording stops
- expected final participant and combined media are not reliably available in blob storage
- the system relies too much on local server storage during ingest and processing
- users cannot consistently access final watch/download URLs for each participant and the combined output

This creates risk in:
- reliability
- supportability
- recovery after server restarts
- user confidence in project readiness
- downstream export and project workflows

---

## Business objective
Move the recording platform to a cloud-native media persistence model where:
1. uploaded participant media becomes durably stored in blob/object storage
2. final participant assets are generated in blob/object storage
3. final combined output is generated in blob/object storage
4. the project page exposes stable playback/download URLs for:
   - each participant
   - the combined output
5. local server files are temporary and cleaned after durability is confirmed

---

## Product goals
- Every participant’s recorded media must be durably persisted to blob storage.
- Every participant must receive a final playable/downloadable asset after processing completes.
- The recording/project must receive a final combined playable/downloadable asset after processing completes.
- Cloud media persistence must not depend on long-term retention of local server files.
- The project page must expose stable URLs for watch/download behavior.
- Cleanup of local files must happen only after blob durability and downstream processing safety conditions are satisfied.

---

## Success criteria
This BRD is successful when:
- blob storage contains the expected participant and combined outputs for completed recordings
- participant assets and combined assets can be played/downloaded from stable cloud-backed URLs
- project minimum-ready and fully-ready states reflect actual cloud-backed asset readiness
- local server disk is no longer the canonical durable location for recorded media
- support can verify media existence from cloud-backed asset state instead of local file assumptions

---

## In scope
- cloud/blob persistence for participant media
- canonical storage model for participant and combined assets
- final participant asset delivery
- final combined asset delivery
- stable client-facing playback/download URLs
- post-stop processing flow needed to produce these assets
- local temp file cleanup policy
- project page readiness and asset availability behavior
- failure handling and recovery semantics for missing or partial media
- acceptance criteria for durable participant and combined output delivery

---

## Out of scope
- full editing timeline
- advanced collaborative editing tools
- third-party internal implementation cloning
- deep redesign of transcript editing UX
- changing guest authorization rules unless required for asset viewing policy
- long-term archival/retention policy beyond canonical final asset persistence
- billing, quotas, or CDN cost strategy

---

## Primary users
- Host / project owner
- Guest participant
- Internal support / operations

---

## User stories

### Host
As a host, after a recording ends, I want each participant’s final media and the combined final media to be available in the cloud so that I can review, download, and use them from the project page.

### Participant
As a participant, I want my recorded media to be safely uploaded and processed so that my contribution is not lost if the server restarts or local temp files are cleaned.

### Support engineer
As a support engineer, I want to verify whether participant and combined assets exist in blob storage and whether processing succeeded, so that I can diagnose readiness failures without relying on local disk state.

---

## Current-state gap
Current implementation behavior is effectively:
- browser records rolling chunks
- chunks are completed through the backend
- chunk materialization lands on local server storage
- post-stop workers are expected to stitch, transcode, and upload final outputs later

This means:
- local storage acts as the initial durable location
- cloud visibility is delayed and may fail if processing or upload never completes
- final participant and combined outputs may be missing in cloud even after stop

The new target behavior must reduce or remove dependence on local storage as the durable media source.

---

## Target-state product behavior

### During recording
- participant media is recorded locally in the browser
- uploaded media must become durably persisted to blob/object storage as part of the ingest flow
- the system may use temporary local spool space only as an implementation detail, not as the canonical durable store

### After stop
- remaining participant media finishes upload/persistence
- tracks are finalized
- participant source media is assembled from persisted uploads
- participant final assets are generated
- combined output is generated
- project state advances based on cloud-backed asset readiness
- client receives stable playback/download URLs

### After processing success
- final participant assets must exist in blob storage
- final combined asset must exist in blob storage
- local temporary files may be cleaned
- project page must show the assets as ready with usable URLs

---

## Product requirements

## FR-01 — Durable cloud persistence for participant media
The system shall persist uploaded participant media to blob/object storage as part of the canonical recording flow.

Acceptance:
- participant media is durably present in blob storage before local cleanup
- cloud persistence is not optional for the main studio flow
- support can verify participant media existence from system state and blob keys

## FR-02 — No local-only final media dependency
The system shall not rely on local server storage as the only durable source for participant or final media.

Acceptance:
- final participant assets are not available only on local disk
- final combined asset is not available only on local disk
- server restart or temp cleanup does not destroy the only canonical media copy

## FR-03 — Participant final asset generation
The system shall generate final participant assets suitable for watch and download.

Acceptance:
- each successful participant has a final asset group
- participant asset has stable playback and/or download URL
- participant asset readiness is visible in project state

## FR-04 — Combined final asset generation
The system shall generate a combined final output suitable for watch and download.

Acceptance:
- combined asset exists as a first-class project asset
- combined asset has stable playback and download URL
- combined asset readiness is visible separately from participant readiness

## FR-05 — Stable project asset URLs
The client shall receive stable cloud-backed URLs for final participant and combined assets.

Acceptance:
- project payload exposes explicit asset URLs
- URLs point to cloud-backed objects or signed delivery endpoints backed by blob storage
- client does not need local file knowledge or internal worker paths

## FR-06 — Minimum-ready semantics
The project shall become minimum-ready when required cloud-backed outputs are available.

Acceptance:
- project minimum-ready depends on actual asset readiness, not only stop or upload completion
- project can become usable before all optional derivatives finish
- optional derivative delays do not hide already-usable participant/combined outputs

## FR-07 — Local temporary storage cleanup
The system shall clean local temp/raw processing files only after durability and processing safety conditions are met.

Acceptance:
- cleanup never removes the only durable copy
- cleanup occurs only after:
  - required blob persistence succeeded
  - required downstream processing succeeded or is safely recoverable
- cleanup failures do not mark cloud-backed assets as missing

## FR-08 — Failure visibility
The system shall show when participant or combined output failed to materialize in cloud storage.

Acceptance:
- failed asset groups expose actionable failed state
- missing participant output does not erase unrelated ready participant outputs
- combined output failure does not hide ready participant outputs

## FR-09 — Supportability
The system shall expose enough internal diagnostics for support to answer:
- was participant media persisted?
- was participant final asset generated?
- was combined asset generated?
- where did the pipeline fail?

Acceptance:
- support can diagnose cloud-persistence and post-stop generation issues
- support does not need local disk access as the only way to understand asset state

---

## Functional flow

### Target flow option
The platform shall support a cloud-native durable ingest path with one of these approved implementations:

### Option A — Direct blob-backed ingest
- browser uploads participant chunk media to blob-backed ingest
- backend records metadata and completion truth
- downstream processing reads from blob/object storage

### Option B — Temporary local spool with immediate durable blob persistence
- browser uploads through current backend/tusd path
- completed chunk is immediately persisted to blob/object storage
- local copy is temporary only
- downstream processing can read from blob or controlled temp files
- local cleanup occurs after durability is confirmed

Business requirement:
Either option is acceptable, but the final product requirement is the same:
**blob/object storage must become the canonical durable media source.**

---

## Canonical storage model

### Participant source storage
The system shall use stable object keys for participant-scoped media.

Illustrative examples:
- `recordings/<recordingId>/participants/<participantId>/tracks/<kind>/chunks/<seq>.webm`
- `recordings/<recordingId>/participants/<participantId>/tracks/<kind>/source/stitched.webm`

### Participant final storage
Illustrative examples:
- `recordings/<recordingId>/participants/<participantId>/final/master.mp4`
- `recordings/<recordingId>/participants/<participantId>/final/master.wav`

### Combined final storage
Illustrative examples:
- `recordings/<recordingId>/combined/final/all-participants.mp4`

### Optional derivative storage
Illustrative examples:
- `recordings/<recordingId>/combined/derivatives/captions.vtt`
- `recordings/<recordingId>/combined/derivatives/transcript.json`

Requirement:
Object keys must be stable and product-oriented. The public asset model must be based on asset identity, not raw path parsing.

---

## Project/API contract requirements

The project/details payload shall expose:
- `combinedAsset`
- `participantAssets[]`
- readiness state
- playback URL
- download URL
- duration and media metadata where applicable
- failure or blocked state where applicable

The client shall not need:
- local file paths
- raw chunk lists
- worker temp paths
- internal stitch/transcode locations

---

## Readiness rules

### Upload complete
All required participant media for the session is durably persisted.

### Processing complete
Required participant assets and combined asset are generated.

### Project minimum ready
Project minimum-ready requires:
- combined final asset ready
- at least one participant final asset ready

### Project fully ready
Project fully-ready requires:
- all required participant and combined final assets ready
- optional derivatives ready or terminally failed with surfaced state

---

## Cleanup policy
The system shall treat local server files as temporary implementation detail only.

Rules:
- local spool/temp files may exist during ingest/processing
- local files may be removed only after canonical blob persistence succeeds
- final participant and combined assets shall not rely on local files remaining present
- local final copies are not required after cloud-backed final asset success
- cleanup must be idempotent and safe to retry

---

## Guest policy
This BRD does not change the current participant authorization model by itself.

By default:
- guest participation remains invite-bound and participant-scoped
- guest access to project assets remains subject to existing product policy
- host/project owner remains the default primary viewer/downloader

If participant self-download is desired later, that must be specified separately.

---

## Non-functional requirements

### NFR-01 Reliability
- no single local temp file may be the only durable media copy
- cloud persistence failures must be detectable

### NFR-02 Recoverability
- interrupted persistence or processing must be retryable
- retries must converge on canonical participant and combined asset identities

### NFR-03 Observability
- blob persistence and final-asset generation must be observable by recording, participant, track, and asset scope

### NFR-04 Security
- final URLs must follow the platform’s security model
- signed/private delivery is acceptable if required

### NFR-05 Scalability
- the design must support multiple participants and long recordings without assuming permanent local storage growth

---

## Risks
- cloud-first ingest may increase implementation complexity
- blob cost may increase versus local-first temp storage
- cleanup must be carefully sequenced to avoid premature deletion
- mixed-state recordings may need compatibility during migration

---

## Dependencies
- blob/object storage provider
- signed/public URL delivery strategy
- worker pipeline support for blob-backed source/final media
- project asset contract updates if needed
- observability for persistence and asset-generation stages

---

## Migration expectations
Implementation should be backward-safe:
- additive first
- compatibility for existing recordings where possible
- no destructive assumption that all old recordings already have blob-backed participant assets
- explicit handling for recordings in mixed local/cloud state during rollout

---

## Acceptance criteria summary
This BRD is complete when all of the following are true:

1. During or immediately after ingest, participant media becomes durably persisted to blob/object storage.
2. After stop and processing, each successful participant has a final cloud-backed asset URL.
3. After stop and processing, the project has a final combined cloud-backed asset URL.
4. Project minimum-ready and fully-ready reflect actual cloud-backed asset readiness.
5. Local server media files are temporary and cleaned after durability/processing safety conditions are met.
6. Support can diagnose missing participant/combined assets without depending on local disk.
7. Client can watch/download participant and combined assets from project APIs using stable URLs.

---

## Suggested implementation title
**Cloud-Native Media Persistence and Final Asset Delivery**

## Suggested follow-up technical work
A corresponding TRD / implementation task register should define:
- chosen ingest option (direct blob-backed or temporary spool + immediate blob persistence)
- canonical storage keys
- worker input/output behavior
- cleanup mechanism
- readiness contract updates
- migration strategy
- test plan
