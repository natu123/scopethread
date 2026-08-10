# ScopeThread Submission Readiness

Last reviewed: 2026-08-10

This document maps every MVP completion requirement to current evidence. `Prepared` means the implementation or runbook exists but the required live proof has not been collected. It must not be presented as verified.

## Definition of Done audit

| Requirement | Required evidence | Current evidence | Status | Remaining gate |
| --- | --- | --- | --- | --- |
| Full demo runs from a public AWS URL | Successful Japanese public E2E against deployed CloudFront and API endpoints | Deployed commit `810e8f1` completed Japanese public E2E in agent run `dd934117-0206-4fe6-94b9-2d3c45a321ab`; the later web-copy and revision-layout commits through `093c000` are live | Verified live | None |
| English and Japanese experience is public | English is the default, Japanese selection persists, known demo evidence is localized, and analysis requests carry the selected locale | Verified against the deployed CloudFront interface and Lambda API contract; the final decision-action copy and revision-chain layout are live with no horizontal overflow | Verified live | None |
| CockroachDB persists structured state, evidence, embeddings, and revisions | Live records for conversations, memories, vectors, links, and agent runs; revision remains after reload | Run `dd934117-0206-4fe6-94b9-2d3c45a321ab` was read back as `succeeded`; the prior decision is `superseded`, the replacement is `active`, `conflicts_with` and `supersedes` are present, and the exact Japanese source quote is retained | Verified live | None |
| Distributed Vector Indexing is exercised and visible | Live vector retrieval and `SHOW INDEXES` evidence for `memory_items_embedding_idx` | Live Cohere embedding retrieval and the project-prefixed vector index were verified and appear in the sanitized Managed MCP video evidence | Verified live | None |
| Managed MCP inspects the same memory read-only | OAuth connection scoped to one cluster, read permission only, allowlisted audit query returns the public agent run and decision chain | Final audit verified a succeeded public run, the `superseded` and `active` decisions, their `supersedes` relation, and `memory_items_embedding_idx`; three `select_query` calls and one `show_statement` call were used with no writes, discovery, or unexpected data exposure; the saved OAuth credentials were removed after submission | Verified live and disconnected | None |
| Tests cover validation, isolation, conflict handling, and revisions | Passing automated suite whose assertions cover each behavior | The final documentation candidate passed `npm run check`: 101 tests across 12 files plus type, migration, infrastructure, repository-safety, history-safety, MCP-audit, and production-build checks; `npm run sam:check` also passed on 2026-08-10 | Verified locally | None |
| Public repository is reproducible and contains no credentials | Clean public branch, setup/runbooks, tracked-file and full-history secret scans, ignored local secret files | GitHub reports `natu123/scopethread` as public with `main`, the MIT license, and the CloudFront homepage; repository and full-history safety checks pass | Verified public | None |
| Public video demonstrates the memory flow in under three minutes | Public video URL and manual review against the storyboard and redaction checklist | The 2:14 English-narrated [YouTube demo](https://www.youtube.com/watch?v=T7881nwgDD0) shows the live workflow, persisted revision chain, English/Japanese interface, sanitized Managed MCP evidence, and architecture; the final 50-cue captions and all seven scene segments were reviewed on 2026-08-10 | Verified public | None |

## Supporting quality audit

| Quality requirement | Evidence | Status |
| --- | --- | --- |
| Traceability | Stored memory includes source conversation IDs, source quotes, evidence IDs, rationales, and explicit revision links | Verified locally and in live seeded memory |
| Safety | Zod validation precedes persistence; request bodies over 16 KiB are rejected before database or Bedrock access | Verified locally |
| Isolation | Hashed session tokens, project ownership checks, expiry, and atomic analysis allowance are covered by API and repository tests | Verified locally and through the successful public anonymous workflow |
| Reliability | External model failures record allowlisted run failures without partial memory; successful memory and run status commit together | Verified by safely failed public runs and the final successful public revision transaction |
| Observability | Agent run ID, model IDs, status, duration, and error category are persisted without conversation text or credentials in logs | Verified live through failure telemetry and the successful run record |
| Cost control | Session allowance, API throttling, request limits, guarded paid scripts, and 14-day log retention are defined | Infrastructure and guarded paid public behavior are verified live |
| Privacy | Demo copy and scripts use fictional data; repository scan checks common credential patterns | Verified locally and against the public video; only the allowlisted agent-run identifier is shown |

## Submission status

The application, Japanese public E2E, final UI refinements, public video, captions, redaction review, and Devpost submission are complete. The published project is available at https://devpost.com/software/scopethread.

The post-submission Managed MCP OAuth cleanup is complete. Keep the public repository, video, Devpost page, and live demo available through the judging period.

## Current execution gate

The live implementation gate is closed. Commit `9cb3832` added one bounded conflict-review generation, commit `810e8f1` normalized critical conflict copy on the host, and the Japanese public E2E then completed successfully in run `dd934117-0206-4fe6-94b9-2d3c45a321ab`. Read-only verification confirmed the exact Japanese source quote, the prior `superseded` decision, the active replacement, and both revision relations.

The public web interface now includes the clarified `Confirmation needed`, `Adopt new direction`, and `Keep current decision` copy plus the aligned revision chain through commit `093c000`. Those static assets are live on CloudFront. The public 2:14 video and 50-cue English caption track passed the final redaction and synchronization review. No additional paid E2E is required for the documentation-only submission closeout.

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
