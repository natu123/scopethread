# ScopeThread Submission Readiness

Last reviewed: 2026-08-07

This document maps every MVP completion requirement to current evidence. `Prepared` means the implementation or runbook exists but the required live proof has not been collected. It must not be presented as verified.

## Definition of Done audit

| Requirement | Required evidence | Current evidence | Status | Remaining gate |
| --- | --- | --- | --- | --- |
| Full demo runs from a public AWS URL | Successful `npm run e2e:public-demo -- --stack-name scopethread --apply` against deployed CloudFront and API endpoints | Three paid runs verified CloudFront security headers, API health, isolated session creation, and CockroachDB bootstrap; the third run used deployed telemetry to identify `MODEL_OUTPUT_UNLINKED_CONFLICT` | Partially verified | Deploy the deterministic single-memory link fix and repeat the paid public E2E once |
| English and Japanese experience is public | English is the default, Japanese selection persists, known demo evidence is localized, and analysis requests carry the selected locale | Verified against the deployed CloudFront interface and Lambda API contract with no browser console errors or horizontal overflow | Verified live | Capture both locales in the final video |
| CockroachDB persists structured state, evidence, embeddings, and revisions | Live records for conversations, memories, vectors, links, and agent runs; revision remains after reload | Migrations `0001` through `0003`, the least-privilege runtime role, the live `scopethread_app` login, fictional seed memory, vector index, and live embedding retrieval were verified; local persisted-memory and revision tests pass | Partially verified | Verify the complete workflow through the public E2E |
| Distributed Vector Indexing is exercised and visible | Live vector retrieval and `SHOW INDEXES` evidence for `memory_items_embedding_idx` | Live Cohere embedding retrieval and the project-prefixed vector index were verified before this review | Verified live | Capture non-secret evidence in the final video |
| Managed MCP inspects the same memory read-only | OAuth connection scoped to one cluster, read permission only, allowlisted audit query returns the public agent run and decision chain | Single-cluster OAuth, the vector index, a succeeded Cohere run, and its fictional persisted decision are verified through data-minimized read tools; that preliminary run has no revision link | Partially verified | Repeat the audit with the public Nova run and verify its decision chain |
| Tests cover validation, isolation, conflict handling, and revisions | Passing automated suite whose assertions cover each behavior | `npm run check` passes 81 tests across 11 files plus type, migration, infrastructure, repository-safety, MCP-audit, and build checks | Verified locally | Re-run immediately before submission |
| Public repository is reproducible and contains no credentials | Clean public branch, setup/runbooks, tracked-file secret scan, ignored local secret files | GitHub `main` is current; `validate:repo-safety` scans 81 tracked files; `.env.local` and `.env.runtime.local` are ignored | Verified locally | Re-run after inserting final public links |
| Public video demonstrates the memory flow in under three minutes | Public video URL and manual review against the storyboard and redaction checklist | A 2 minute 40 second storyboard is prepared in `DEVPOST_DRAFT.md` | Prepared | Record, review, upload, and add the URL |

## Supporting quality audit

| Quality requirement | Evidence | Status |
| --- | --- | --- |
| Traceability | Stored memory includes source conversation IDs, source quotes, evidence IDs, rationales, and explicit revision links | Verified locally and in live seeded memory |
| Safety | Zod validation precedes persistence; request bodies over 16 KiB are rejected before database or Bedrock access | Verified locally |
| Isolation | Hashed session tokens, project ownership checks, expiry, and atomic analysis allowance are covered by API and repository tests | Verified locally; public anonymous session bootstrap verified live, with the paid analysis path pending |
| Reliability | External model failures record allowlisted run failures without partial memory; successful memory and run status commit together | Verified locally and by one successful direct E2E plus one safely failed public analysis |
| Observability | Agent run ID, model IDs, status, duration, and error category are persisted without conversation text or credentials in logs | Verified locally |
| Cost control | Session allowance, API throttling, request limits, guarded paid scripts, and 14-day log retention are defined | Infrastructure is deployed; paid public behavior remains pending |
| Privacy | Demo copy and scripts use fictional data; repository scan checks common credential patterns | Verified locally; final video review pending |

## Live execution order

Migration `0003_runtime_role.sql`, the `scopethread_app` runtime identity, the scoped development policies, the version-one runtime `SecureString`, the deployment bootstrap, and the 15-resource application stack were applied and verified on 2026-08-06. Run the remaining steps only after the corresponding explicit approval:

1. Deploy the deterministic single-memory conflict-link fix to the application stack.
2. Re-run `npm run e2e:public-demo -- --stack-name scopethread --apply` once and capture a successful public run ID.
3. Repeat the Managed MCP audit with that run ID and verify its decision chain.
4. Record and review the video.
5. Replace the remaining Devpost placeholders and perform the final audit.

## Current execution gate

AWS approved and activated Nova 2 Lite for the global cross-region inference profile on 2026-08-07. The direct agent-memory E2E then succeeded with one retrieved evidence record, one grounded conflict, and two transactionally persisted embedded memories. The first public E2E reached `/analyze` but failed safely with `MODEL_OUTPUT_INVALID`. Cause-specific repair guidance was deployed, and a second explicitly approved run stopped at the same safe category without partial analysis persistence. A third run with deployed allowlisted telemetry identified `MODEL_OUTPUT_UNLINKED_CONFLICT`. The deterministic, conversation-grounded host fix is locally verified; its deployment and one paid proof run remain explicit approval gates before the final MCP revision-chain audit and video.

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
