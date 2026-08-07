# ScopeThread Submission Readiness

Last reviewed: 2026-08-07

This document maps every MVP completion requirement to current evidence. `Prepared` means the implementation or runbook exists but the required live proof has not been collected. It must not be presented as verified.

## Definition of Done audit

| Requirement | Required evidence | Current evidence | Status | Remaining gate |
| --- | --- | --- | --- | --- |
| Full demo runs from a public AWS URL | Successful `npm run e2e:public-demo -- --stack-name scopethread --apply` against deployed CloudFront and API endpoints | The deployed host fix completed the guarded public E2E on 2026-08-07; agent run `738cf3ad-8bd4-4c3f-ba31-9330e4792a36` persisted the verified revision chain | Verified live | Capture the workflow in the final video |
| English and Japanese experience is public | English is the default, Japanese selection persists, known demo evidence is localized, and analysis requests carry the selected locale | Verified against the deployed CloudFront interface and Lambda API contract with no browser console errors or horizontal overflow | Verified live | Capture both locales in the final video |
| CockroachDB persists structured state, evidence, embeddings, and revisions | Live records for conversations, memories, vectors, links, and agent runs; revision remains after reload | The successful public run was read back with status `succeeded`, the prior decision `superseded`, the replacement decision `active`, and both `conflicts_with` and `supersedes` links with the expected reason | Verified live | Capture non-secret evidence in the final video |
| Distributed Vector Indexing is exercised and visible | Live vector retrieval and `SHOW INDEXES` evidence for `memory_items_embedding_idx` | Live Cohere embedding retrieval and the project-prefixed vector index were verified before this review | Verified live | Capture non-secret evidence in the final video |
| Managed MCP inspects the same memory read-only | OAuth connection scoped to one cluster, read permission only, allowlisted audit query returns the public agent run and decision chain | Single-cluster OAuth and preliminary read-only MCP evidence are verified; direct read-only SQL confirmed the successful public Nova chain; the latest MCP discovery reached the configured server but its expired OAuth grant stopped the attempt before any query | Partially verified | Reauthenticate read-only OAuth, start a task with the refreshed MCP tools, and repeat the allowlisted audit for the successful public run |
| Tests cover validation, isolation, conflict handling, and revisions | Passing automated suite whose assertions cover each behavior | `npm run check` passes 81 tests across 11 files plus type, migration, infrastructure, repository-safety, MCP-audit, and build checks | Verified locally | Re-run immediately before submission |
| Public repository is reproducible and contains no credentials | Clean public branch, setup/runbooks, tracked-file and full-history secret scans, ignored local secret files | GitHub reports the repository as public with `main`, the MIT license, and the public demo homepage; anonymous requests to the repository, README, and license returned HTTP 200; both safety validators passed immediately before publicization | Verified public | Re-run both safety audits and record the final commit hash immediately before submission |
| Public video demonstrates the memory flow in under three minutes | Public video URL and manual review against the storyboard and redaction checklist | A 2 minute 40 second storyboard is prepared in `DEVPOST_DRAFT.md`; the timed English narration, capture actions, recording gate, and redaction review are prepared in `DEMO_VIDEO_SCRIPT.md` | Prepared | Complete the Managed MCP audit, then record, review, upload, and add the URL |

## Supporting quality audit

| Quality requirement | Evidence | Status |
| --- | --- | --- |
| Traceability | Stored memory includes source conversation IDs, source quotes, evidence IDs, rationales, and explicit revision links | Verified locally and in live seeded memory |
| Safety | Zod validation precedes persistence; request bodies over 16 KiB are rejected before database or Bedrock access | Verified locally |
| Isolation | Hashed session tokens, project ownership checks, expiry, and atomic analysis allowance are covered by API and repository tests | Verified locally and through the successful public anonymous workflow |
| Reliability | External model failures record allowlisted run failures without partial memory; successful memory and run status commit together | Verified by safely failed public runs and the final successful public revision transaction |
| Observability | Agent run ID, model IDs, status, duration, and error category are persisted without conversation text or credentials in logs | Verified live through failure telemetry and the successful run record |
| Cost control | Session allowance, API throttling, request limits, guarded paid scripts, and 14-day log retention are defined | Infrastructure and guarded paid public behavior are verified live |
| Privacy | Demo copy and scripts use fictional data; repository scan checks common credential patterns | Verified locally; final video review pending |

## Live execution order

Migration `0003_runtime_role.sql`, the `scopethread_app` runtime identity, the scoped development policies, the version-one runtime `SecureString`, the deployment bootstrap, and the 15-resource application stack were applied and verified on 2026-08-06. Run the remaining steps only after the corresponding explicit approval:

1. Repeat the Managed MCP audit with the successful public run ID and verify its decision chain.
2. Record and review the video.
3. Replace the remaining Devpost placeholders and perform the final audit.

## Current execution gate

AWS approved and activated Nova 2 Lite for the global cross-region inference profile on 2026-08-07. The direct agent-memory E2E then succeeded with one retrieved evidence record, one grounded conflict, and two transactionally persisted embedded memories. The first public E2E reached `/analyze` but failed safely with `MODEL_OUTPUT_INVALID`. Cause-specific repair guidance was deployed, and a second explicitly approved run stopped at the same safe category without partial analysis persistence. A third run with deployed allowlisted telemetry identified `MODEL_OUTPUT_UNLINKED_CONFLICT`. After the deterministic conversation-grounded link and `proposed` state normalization were deployed, the guarded public E2E succeeded. A read-only database audit confirmed the complete revision chain. The remaining live gates are the Managed MCP audit and final video.

## Official rules audit

Reviewed against the [official Devpost rules](https://cockroachdb-ai.devpost.com/rules) on 2026-08-07:

- Submission deadline: August 18, 2026 at 5:00 pm EDT, which is August 19, 2026 at 6:00 am JST.
- The project must use CockroachDB as persistent agent memory, be deployed on AWS, use at least two listed CockroachDB tools, and use at least one listed AWS service.
- The public repository must include source, setup instructions, dependencies, example configuration, and a visible open-source license.
- The submission must include a functional demo URL and an English text description.
- The public YouTube or Vimeo video must be under three minutes and show both the functioning project and CockroachDB memory layer.
- The project must remain available free of charge and without restriction through the judging period ending September 15, 2026 at 5:00 pm EDT.

## Final evidence packet

Before submission, retain only non-secret evidence:

- final Git commit hash;
- `npm run check` summary;
- `npm run sam:check` summary;
- CloudFormation stack status and public CloudFront URL;
- public E2E success with agent run ID;
- MCP read-only authorization and allowlisted query result;
- public video URL;
- completed Devpost checklist.

Never include account IDs, cluster IDs, database URLs, OAuth tokens, bearer tokens, passwords, or real client data.
