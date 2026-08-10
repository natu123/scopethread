# ScopeThread Submission Readiness

Last reviewed: 2026-08-10

This document maps every MVP completion requirement to current evidence. `Prepared` means the implementation or runbook exists but the required live proof has not been collected. It must not be presented as verified.

## Definition of Done audit

| Requirement | Required evidence | Current evidence | Status | Remaining gate |
| --- | --- | --- | --- | --- |
| Full demo runs from a public AWS URL | Successful `npm run e2e:public-demo -- --stack-name scopethread --apply` against deployed CloudFront and API endpoints | The deployed host fix completed the guarded public E2E on 2026-08-07; agent run `738cf3ad-8bd4-4c3f-ba31-9330e4792a36` persisted the verified revision chain | Verified live | Capture the workflow in the final video |
| English and Japanese experience is public | English is the default, Japanese selection persists, known demo evidence is localized, and analysis requests carry the selected locale | Verified against the deployed CloudFront interface and Lambda API contract with no browser console errors or horizontal overflow | Verified live | Capture both locales in the final video |
| CockroachDB persists structured state, evidence, embeddings, and revisions | Live records for conversations, memories, vectors, links, and agent runs; revision remains after reload | The successful public run was read back with status `succeeded`, the prior decision `superseded`, the replacement decision `active`, and both `conflicts_with` and `supersedes` links with the expected reason | Verified live | Capture non-secret evidence in the final video |
| Distributed Vector Indexing is exercised and visible | Live vector retrieval and `SHOW INDEXES` evidence for `memory_items_embedding_idx` | Live Cohere embedding retrieval and the project-prefixed vector index were verified before this review | Verified live | Capture non-secret evidence in the final video |
| Managed MCP inspects the same memory read-only | OAuth connection scoped to one cluster, read permission only, allowlisted audit query returns the public agent run and decision chain | Final audit verified public run `738cf3ad-8bd4-4c3f-ba31-9330e4792a36` as `succeeded`, the prior decision as `superseded`, the replacement as `active`, their `supersedes` relation and reason, and `memory_items_embedding_idx`; three `select_query` calls and one `show_statement` call were used with no writes, additional discovery, or unexpected database data exposure | Verified live | Capture only the allowlisted evidence in the final video and revoke OAuth after recording |
| Tests cover validation, isolation, conflict handling, and revisions | Passing automated suite whose assertions cover each behavior | At source commit `fb66e5a`, `npm run check` passed 98 tests across 12 files plus type, migration, infrastructure, repository-safety, history-safety, MCP-audit, and production-build checks; `npm run sam:check` also passed | Verified locally | Re-run immediately before submission |
| Public repository is reproducible and contains no credentials | Clean public branch, setup/runbooks, tracked-file and full-history secret scans, ignored local secret files | GitHub reports the repository as public with `main`, the MIT license, and the public demo homepage; source commit `fb66e5a` is included in public `main`; repository safety passed across 89 tracked files and the full-history scan passed | Verified public | Re-run both safety audits after the documentation commit and record the final commit hash |
| Public video demonstrates the memory flow in under three minutes | Public video URL and manual review against the storyboard and redaction checklist | The 2 minute 14 second English-narrated demo is publicly available at [YouTube](https://www.youtube.com/watch?v=T7881nwgDD0) and shows the public workflow, persisted revision chain, English/Japanese interface, sanitized Managed MCP evidence, and architecture | Verified public | Complete the final redaction and caption-track review |

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

1. Deploy commit `fb66e5a` and verify the Japanese public analysis path after explicit approval.
2. Complete the final video redaction and caption-track review.
3. Replace the remaining Devpost placeholders and perform the final audit.
4. Revoke or disconnect the Managed MCP OAuth session after recording.

## Current execution gate

AWS approved and activated Nova 2 Lite for the global cross-region inference profile on 2026-08-07. The direct agent-memory E2E then succeeded with one retrieved evidence record, one grounded conflict, and two transactionally persisted embedded memories. The first public E2E reached `/analyze` but failed safely with `MODEL_OUTPUT_INVALID`. Cause-specific repair guidance was deployed, and a second explicitly approved run stopped at the same safe category without partial analysis persistence. A third run with deployed allowlisted telemetry identified `MODEL_OUTPUT_UNLINKED_CONFLICT`. After the deterministic conversation-grounded link and `proposed` state normalization were deployed, the guarded public E2E succeeded. A read-only database audit confirmed the complete revision chain, and the final Managed MCP audit independently verified the same run, revision chain, and vector index.

On 2026-08-10, a manual Japanese analysis run failed safely as `MODEL_OUTPUT_UNGROUNDED_SOURCE_QUOTE` because both Nova attempts returned a generated quote that was not an exact substring of the conversation. Commit `75426ad` replaced model-authored quote text with host-owned sentence evidence: Nova selects a `conversation-quote-N` ID and the host resolves that ID to exact source text before schema and grounding validation. That commit was deployed successfully, but the one approved Japanese public E2E run failed safely as `MODEL_OUTPUT_UNKNOWN_CONVERSATION_EVIDENCE` in agent run `a1264725-4d65-4c6a-817d-16e063bb4f10`; its `conversation_id` remained null, proving that no analyzed conversation, memory, or revision was partially persisted.

Commit `472673a` resolved the sole evidence on the host only when both the conversation-evidence set and extracted-memory set contained exactly one item. It was deployed successfully, but the one approved Japanese public E2E rerun failed safely with the same category in agent run `44b78dff-151b-4d3c-9c35-5d632a2176e0`; its `conversation_id` also remained null. The local segmenter confirmed that the Japanese input produces exactly one sentence-evidence candidate, so the additional extracted-memory cardinality gate was stricter than the provenance boundary required.

Commit `fb66e5a` now grounds every extracted memory in the host-owned quote when there is exactly one conversation-evidence candidate, regardless of the number of memories. Multiple evidence candidates still require an exact valid ID and remain fail-closed when ambiguous. The local suite and SAM artifact build pass, but this follow-up commit is not yet deployed. The remaining live gate is deployment followed by one Japanese public verification run.

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
