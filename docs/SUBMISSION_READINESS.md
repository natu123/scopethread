# ScopeThread Submission Readiness

Last reviewed: 2026-08-06

This document maps every MVP completion requirement to current evidence. `Prepared` means the implementation or runbook exists but the required live proof has not been collected. It must not be presented as verified.

## Definition of Done audit

| Requirement | Required evidence | Current evidence | Status | Remaining gate |
| --- | --- | --- | --- | --- |
| Full demo runs from a public AWS URL | Successful `npm run e2e:public-demo -- --stack-name scopethread --apply` against deployed CloudFront and API endpoints | The deployment bootstrap, dedicated roles, 15-resource application stack, API health, static web application, security headers, and no-Bedrock public session-memory bootstrap are verified live | Partially verified | Run the paid public E2E after Nova quota activation |
| CockroachDB persists structured state, evidence, embeddings, and revisions | Live records for conversations, memories, vectors, links, and agent runs; revision remains after reload | Migrations `0001` through `0003`, the least-privilege runtime role, the live `scopethread_app` login, fictional seed memory, vector index, and live embedding retrieval were verified; local persisted-memory and revision tests pass | Partially verified | Verify the complete workflow through the public E2E |
| Distributed Vector Indexing is exercised and visible | Live vector retrieval and `SHOW INDEXES` evidence for `memory_items_embedding_idx` | Live Cohere embedding retrieval and the project-prefixed vector index were verified before this review | Verified live | Capture non-secret evidence in the final video |
| Managed MCP inspects the same memory read-only | OAuth connection scoped to one cluster, read permission only, allowlisted audit query returns the public agent run and decision chain | Read-only audit runbook and queries are prepared | Prepared | Authenticate and run the live MCP audit |
| Tests cover validation, isolation, conflict handling, and revisions | Passing automated suite whose assertions cover each behavior | `npm run check` passes 62 tests across nine files plus type, migration, infrastructure, repository-safety, and build checks | Verified locally | Re-run immediately before submission |
| Public repository is reproducible and contains no credentials | Clean public branch, setup/runbooks, tracked-file secret scan, ignored local secret files | GitHub `main` is current; `validate:repo-safety` scans 77 tracked files; `.env.local` and `.env.runtime.local` are ignored | Verified locally | Re-run after inserting final public links |
| Public video demonstrates the memory flow in under three minutes | Public video URL and manual review against the storyboard and redaction checklist | A 2 minute 40 second storyboard is prepared in `DEVPOST_DRAFT.md` | Prepared | Record, review, upload, and add the URL |

## Supporting quality audit

| Quality requirement | Evidence | Status |
| --- | --- | --- |
| Traceability | Stored memory includes source conversation IDs, source quotes, evidence IDs, rationales, and explicit revision links | Verified locally and in live seeded memory |
| Safety | Zod validation precedes persistence; request bodies over 16 KiB are rejected before database or Bedrock access | Verified locally |
| Isolation | Hashed session tokens, project ownership checks, expiry, and atomic analysis allowance are covered by API and repository tests | Verified locally; public anonymous session bootstrap verified live, with the paid analysis path pending |
| Reliability | External model failures record allowlisted run failures without partial memory; successful memory and run status commit together | Verified locally |
| Observability | Agent run ID, model IDs, status, duration, and error category are persisted without conversation text or credentials in logs | Verified locally |
| Cost control | Session allowance, API throttling, request limits, guarded paid scripts, and 14-day log retention are defined | Infrastructure is deployed; paid public behavior remains pending |
| Privacy | Demo copy and scripts use fictional data; repository scan checks common credential patterns | Verified locally; final video review pending |

## Live execution order

Migration `0003_runtime_role.sql`, the `scopethread_app` runtime identity, the scoped development policies, the version-one runtime `SecureString`, the deployment bootstrap, and the 15-resource application stack were applied and verified on 2026-08-06. Run the remaining steps only after the corresponding explicit approval:

1. Re-run `npm run e2e:agent-memory -- --apply` after AWS confirms Nova quota.
2. Run `npm run e2e:public-demo -- --stack-name scopethread --apply`.
3. Connect CockroachDB Cloud Managed MCP with single-cluster OAuth and read-only authorization, then execute the audit runbook.
4. Record and review the video.
5. Replace the remaining Devpost placeholders and perform the final audit.

## Current external blocker

Amazon Nova live inference remains dependent on the AWS Support quota response. This does not block local implementation or documentation, but it blocks the live agent-memory gate, the full public E2E, and the final video.

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
