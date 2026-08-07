# ScopeThread

> Never lose the thread of client decisions.

ScopeThread is a persistent-memory agent for web production requirements. It turns client conversations into traceable requirements, decisions, revisions, open questions, and next-step prompts without losing the context behind them.

The public interface is English-first for hackathon review and includes a persistent Japanese switch. The selected locale also travels with each analysis request, so Amazon Nova and the deterministic demo analyzer return natural English or Japanese while preserving client source quotes. Translation dictionaries and locale-aware formatters keep the interface ready for additional languages without adding shallow, unverified translations to the MVP.

## Status

ScopeThread has a verified application scaffold for the web interface, Lambda API, core domain workflow, Bedrock adapters, CockroachDB vector queries, database migration, and AWS SAM infrastructure. The CockroachDB Cloud connection, migration, vector index, fictional demo memory, live Cohere embedding retrieval, one-time deployment bootstrap, AWS application stack, and [public CloudFront application](https://d2kn7tl59k7usc.cloudfront.net/) have been verified in Singapore. The deployed API health, a no-Bedrock session-to-memory smoke path, the public browser session, the English/Japanese interface and locale-aware API contract, and a single-cluster read-only Managed MCP connection pass against the live system. AWS approved the Nova 2 Lite quota request on 2026-08-07, and the guarded direct agent-memory E2E subsequently verified live Nova conflict detection, vector retrieval, and transactional CockroachDB persistence.

Agent-run observability is implemented locally. Every valid analysis receives a durable run ID, model identifiers, status, duration, and a safe error category. Successful memory writes and the run's `succeeded` transition share one CockroachDB transaction; failed model calls do not create partial memory.

Short-lived public demo sessions are implemented, and migration `0002_demo_session_access.sql` is verified on the live CockroachDB cluster. Each browser session receives an opaque bearer token, while CockroachDB stores only its SHA-256 hash. The API verifies the token, project ownership, expiry, and an atomic per-session analysis allowance before invoking Bedrock. API Gateway route throttling provides an additional coarse abuse-control layer. The AWS application stack and static web application are deployed.

Migration `0003_runtime_role.sql` is applied and verified on the live CockroachDB cluster. Its non-login, least-privilege role for the Lambda database identity intentionally excludes `DELETE`, object creation, grant delegation, and schema-wide future privileges. Public-schema object creation is also verified as revoked from the built-in `public` role.

Re-check the live schema and runtime-role boundaries without applying migrations:

```powershell
npm run db:verify
```

The guarded runtime-user provisioner has created and verified `scopethread_app` on the live cluster. Its only role membership is `scopethread_runtime`, its inherited table privileges match the least-privilege design, and it has no public-schema `CREATE`. The unprinted connection string is stored only in the ignored `.env.runtime.local` file.

The scoped `ScopeThreadBedrockDevelopment` inline policy is applied to `scopethread-dev` and verified against the repository policy with IAM simulation. It permits access only to the selected Bedrock models and the fixed `/scopethread/prod/database-url` parameter; unrelated parameters, deletion, Marketplace subscription, IAM mutation, and other models remain denied. The runtime connection is stored there as a Standard `SecureString`, and its version-one metadata is verified without decrypting or printing the value.

At Lambda cold start, the runtime loader decrypts that fixed parameter once, requires the `scopethread_app` identity, `defaultdb`, a password, and `sslmode=verify-full`, then caches the repository. Parameter Store failures become a sanitized configuration error without exposing the SDK error or connection value.

The guarded public E2E derives its endpoints from the deployed CloudFormation stack and verifies CloudFront security headers, API health, isolated session creation, live Bedrock conflict analysis, and CockroachDB revision persistence in one reproducible scenario. Its first paid run on 2026-08-07 verified the public infrastructure and session-memory bootstrap but stopped at `/analyze` with the safe `MODEL_OUTPUT_INVALID` category. Cause-specific Nova repair guidance was then deployed, but the second paid run stopped at the same category. A third run with allowlisted telemetry identified `MODEL_OUTPUT_UNLINKED_CONFLICT` without storing generated content. After deploying the deterministic host-side link and conflict-state normalization, the complete public E2E succeeded and persisted a verified revision chain.

Authenticated memory inspection is implemented locally. The browser reloads project-scoped items and links from CockroachDB, so active decisions, superseded decisions, source quotes, rationales, and revision chains survive a page reload instead of depending on temporary browser state.

False-positive conflict dismissal is implemented locally. A dismissal records its reason on the proposed memory while leaving the prior active decision unchanged, and the persisted dismissal remains visible after a page reload.

The CockroachDB Cloud Managed MCP connection is verified live as a single-cluster, OAuth, read-only workflow. Allowlisted queries verified the vector index, a succeeded Cohere agent run, and its fictional persisted decision without reading embeddings or session-token data. The public Nova revision chain is now verified through the application and direct read-only SQL; the final Managed MCP query for that same run remains pending.

## Design Documents

- [MVP requirements](docs/REQUIREMENTS.md)
- [Proposed architecture](docs/ARCHITECTURE.md)
- [AWS development runbook](docs/AWS_RUNBOOK.md)
- [CockroachDB Cloud MCP audit runbook](docs/MCP_AUDIT_RUNBOOK.md)
- [Devpost project story draft](docs/DEVPOST_DRAFT.md)
- [Submission readiness audit](docs/SUBMISSION_READINESS.md)

## Local Development

Requirements:

- Node.js 24 or later.
- npm 11 or later.
- AWS SAM CLI 1.165.0 for infrastructure builds.

Install dependencies and start the web scaffold:

```bash
npm install
npm run dev
```

Run the complete local verification suite:

```bash
npm run check
```

The suite also scans every Git-tracked text file for common AWS keys, private keys, credential-bearing PostgreSQL URLs, account IDs, and accidentally tracked local environment files. `.env.local` and `.env.runtime.local` must remain ignored.

Validate the SAM template, build the Lambda bundle, and run a health check
against the built artifact:

```bash
npm run sam:check
```

This command is local-only. It does not deploy resources or call AWS services.

Deployment uses two guarded stages. The one-time bootstrap creates a private,
versioned artifact bucket plus dedicated CloudFormation and Lambda roles. The
application deployer then requires `scopethread-dev`, the fixed bootstrap
outputs, and the fixed `scopethread` stack:

```powershell
npm run aws:bootstrap-deployment
npm run aws:deploy
```

Both commands are local dry gates unless `--apply` is supplied after explicit
approval. The bootstrap is the only stage that requires the root profile and
logs it out after the operation; application deployment refuses root.

The live `scopethread-bootstrap` stack is verified as `CREATE_COMPLETE` with
its artifact bucket, customer-managed deployment policy, CloudFormation role,
and Lambda role all created successfully.

The browser requires a configured `VITE_API_BASE_URL` before it submits an analysis request. It does not simulate a successful agent response when the API is unavailable.

## Repository Structure

```text
apps/
  api/                 Lambda HTTP handler scaffold
  web/                 React and Vite browser application
packages/
  bedrock/             Bedrock chat and multilingual embedding adapters
  core/                Domain schemas, ports, and analysis use case
  database/            CockroachDB pool, vector retrieval, and migration
infra/
  template.yaml        AWS SAM infrastructure
  deployment-bootstrap.yaml
                       Retained deployment bucket and dedicated IAM roles
  iam/                 Scoped development IAM policy
docs/
  REQUIREMENTS.md      MVP requirements and acceptance criteria
  ARCHITECTURE.md      Architecture and security decisions
  AWS_RUNBOOK.md       Short-lived AWS login and live-test procedure
```

## The Problem

Web projects rarely fail because a team cannot record a meeting. They fail because requirements are scattered across conversations, decisions lose their rationale, unresolved questions disappear, and later requests conflict with earlier agreements.

ScopeThread is designed to preserve that working memory across sessions and use it to guide the next action.

## MVP

The first version will:

1. Accept pasted client meeting notes or conversation text.
2. Extract requirements, decisions, rationales, revisions, and open questions.
3. Persist structured records and semantic memory in CockroachDB.
4. Retrieve relevant memories when a new request arrives.
5. Detect conflicts between new requests and previous decisions.
6. Recommend the next questions to ask the client.
7. Preserve superseded decisions instead of silently overwriting history.

## Planned Demo

1. A client says that the website does not need a booking feature.
2. ScopeThread stores the statement as an active decision.
3. In a later session, the client asks for booking buttons on every page.
4. ScopeThread retrieves the earlier decision and identifies the conflict.
5. The agent asks whether the project direction should change.
6. If the change is approved, ScopeThread records the new decision while retaining the previous decision and its rationale.

## Why Agentic Memory Matters

ScopeThread is not intended to be a chatbot with a transcript. Its memory changes what the agent does next. Structured memory provides the current source of truth, while semantic retrieval reconnects new requests with relevant conversations and decision history.

## Planned Architecture

```text
Web application
    |
    v
AWS agent runtime
    |
    +--> Amazon Bedrock
    |
    v
CockroachDB Cloud
    +--> Structured project memory
    +--> Conversation history
    +--> Vector embeddings and semantic retrieval
```

The planned hackathon integrations are:

| Technology | Planned role | Status |
| --- | --- | --- |
| CockroachDB Distributed Vector Indexing | Retrieve semantically related conversations and decisions. | Live embedding retrieval verified. |
| CockroachDB Cloud Managed MCP Server | Provide controlled agent access to project memory. | Single-cluster OAuth and preliminary read-only audit verified live; final revision-chain audit pending. |
| Amazon Bedrock | Extract, reason over, and respond with project context. | Live Cohere retrieval, direct Nova agent-memory E2E, and the complete public conflict-and-revision workflow are verified. |
| AWS Lambda | Run the serverless agent workflow. | Stack, API health, SSM runtime configuration, and CockroachDB session-memory smoke path verified live. |

## Memory Model

ScopeThread will separate two complementary forms of memory:

- **Structured memory:** projects, requirements, decisions, revisions, open questions, status, provenance, and validity.
- **Semantic memory:** conversation passages and embeddings used to retrieve relevant historical context.

Structured records remain authoritative. Vector similarity is used to find context, not to replace explicit project state.

## Privacy and Security

- The demo will use fictional client data.
- Secrets and credentials must not be committed to the repository.
- Client and project data will be isolated by explicit identifiers.
- Database and agent access will follow least-privilege principles.
- Memory changes will retain provenance and revision history.

## Roadmap

- [x] Confirm the MVP requirements and technology stack.
- [x] Define the database schema and memory lifecycle.
- [x] Build one end-to-end memory workflow locally.
- [x] Add conflict detection and next-question generation.
- [x] Restore persisted project memory and revision history after page reload.
- [x] Dismiss false-positive conflicts without replacing active decisions.
- [x] Deploy the functional demo on AWS.
- [x] Verify security, observability, and failure handling.
- [ ] Record a public demo video under three minutes.
- [ ] Complete the Devpost project story and submission checklist.

## License

This project is licensed under the [MIT License](LICENSE).
