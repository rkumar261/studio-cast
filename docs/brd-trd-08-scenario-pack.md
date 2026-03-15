# BRD/TRD 08 Scenario Pack

This document is the browser/manual scenario pack for BRD/TRD 08.

It complements automated tests. It does not replace them.

## Environment Inputs

- `E2E_RECORDING_ID`
- `E2E_GUEST_INVITE_URL`
- Optional: `E2E_OWNER_ACCESS_TOKEN` for owner project-page browser smoke
- Local services required by the Playwright config:
  - backend on `:8080`
  - frontend on `:3000`

## Scenario Matrix

| Scenario ID | Variant | Mode | Evidence Target | Notes |
| --- | --- | --- | --- | --- |
| `HOST-CORE-001` | Host only, stable network | Manual | Host can start, stop, and remain in studio until upload handoff is truthful | Use [recording-acceptance.md](/Users/rakeshkumar/dev/projects/studio-cast/docs/recording-acceptance.md) |
| `HOST-CORE-002` | Host only, delayed upload completion | Manual | Studio stays product-oriented and does not claim project-ready too early | Confirm `uploading` then `upload complete` then `processing` |
| `HOST-CORE-003` | Host + multiple guests | Manual | Room, upload handoff, and combined asset work at multi-participant scale | Manual-only |
| `GUEST-CORE-001` | Invite entry, no login | Automated + Manual | Guest reaches prejoin/studio without owner auth | [guest-join.spec.ts](/Users/rakeshkumar/dev/projects/studio-cast/tests/e2e/guest-join.spec.ts) |
| `GUEST-CORE-002` | Required name, optional email | Automated + Manual | Guest cannot continue unnamed; email stays optional | [guest-join.spec.ts](/Users/rakeshkumar/dev/projects/studio-cast/tests/e2e/guest-join.spec.ts) |
| `GUEST-CORE-003` | Guest leaves after session | Automated + Manual | Guest lands on thanks/upload-complete flow and does not bounce to prejoin | [guest-leave.spec.ts](/Users/rakeshkumar/dev/projects/studio-cast/tests/e2e/guest-leave.spec.ts) |
| `GUEST-CORE-004` | Guest delayed upload | Manual | Guest completion remains safe while owner project access stays denied | Use support snapshot if upload stalls |
| `UPLOAD-RECOVERY-001` | Duplicate initiate retry | Automated | No duplicate logical chunk is created | Backend service test |
| `UPLOAD-RECOVERY-002` | Duplicate complete retry | Automated | Replayed completion stays idempotent | Backend service test |
| `UPLOAD-RECOVERY-003` | Refresh during upload | Manual | Recovery resumes from canonical next expected sequence | Confirm no permanent stuck upload |
| `UPLOAD-RECOVERY-004` | Slow upload / intermittent network | Manual | Post-stop upload eventually converges | Manual-only |
| `UPLOAD-RECOVERY-005` | Offline and reconnect | Manual | Upload recovery plus finalize stay truthful | Manual-only |
| `FINALIZE-PROCESS-001` | Stop/finalize baseline | Automated + Manual | Final sequence and timestamps stay monotonic | Backend tests + host flow |
| `FINALIZE-PROCESS-002` | Missing chunk before final seq | Automated | Stitch is blocked instead of guessing readiness | Backend pipeline/readiness tests |
| `FINALIZE-PROCESS-003` | Late completion after stop | Automated + Manual | Processing does not advance before upload truth is complete | Backend pipeline tests |
| `FINALIZE-PROCESS-004` | Worker dependency order | Manual | Stitch -> transcode -> ASR -> export ordering is respected | Use support snapshot and logs |
| `PROJECT-ASSET-001` | Owner project page smoke | Automated + Manual | Combined asset stays primary, participant assets remain first-class | [project-page.spec.ts](/Users/rakeshkumar/dev/projects/studio-cast/tests/e2e/project-page.spec.ts) |
| `PROJECT-ASSET-002` | Minimum-ready vs fully-processed | Automated + Manual | Project is usable before optional derivatives finish | Route tests + project page |
| `PROJECT-ASSET-003` | Pending/failed derivative communication | Automated + Manual | Product-facing states stay honest without exposing internals | Route tests + manual UI check |
| `PROJECT-ASSET-004` | Audio-only / screen-share-supported variants | Manual | Presentation remains coherent for allowed media combinations | Manual-only |
| `AUTHZ-001` | Guest participant scope | Automated | Guest cannot act on another participant’s upload surface | Backend auth tests |
| `AUTHZ-002` | Guest owner-route denial | Automated + Manual | Guest stays denied from project/admin/diagnostic routes | Backend route tests + manual browser check |

## Playwright Smoke Commands

Guest join:

```bash
E2E_RECORDING_ID='<recording-id>' \
E2E_GUEST_INVITE_URL='http://127.0.0.1:3000/studio/<recording-id>?invite=<token>' \
npm run test:e2e:guest
```

Guest leave:

```bash
E2E_RECORDING_ID='<recording-id>' \
E2E_GUEST_INVITE_URL='http://127.0.0.1:3000/studio/<recording-id>?invite=<token>' \
npm run test:e2e:leave
```

Owner project page:

```bash
E2E_RECORDING_ID='<recording-id>' \
E2E_GUEST_INVITE_URL='http://127.0.0.1:3000/studio/<recording-id>?invite=<token>' \
E2E_OWNER_ACCESS_TOKEN='<jwt>' \
npm run test:e2e:project
```

## Manual Scenario Report Template

For each executed manual scenario, capture:

- scenario ID
- environment and app versions
- recording ID
- participants involved
- expected result
- actual result
- screenshots or short screen capture
- support snapshot or lifecycle diagnostics if there was a failure
- final pass/fail note

## Manual-Only Gap Rule

If a scenario cannot be automated realistically without hiding the real risk, keep it manual and require evidence in the release pack.
