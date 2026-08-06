# ScopeThread

> Never lose the thread of client decisions.

ScopeThread is a persistent-memory agent for web production requirements. It turns client conversations into traceable requirements, decisions, revisions, open questions, and next-step prompts without losing the context behind them.

## Status

ScopeThread has a verified application scaffold for the web interface, Lambda API, core domain workflow, Bedrock adapters, CockroachDB vector queries, database migration, and AWS SAM infrastructure. The CockroachDB Cloud connection, migration, vector index, fictional demo memory, and live Cohere embedding retrieval have been verified against the Singapore cluster. Nova 2 Lite live inference is waiting for AWS to activate the new account's non-zero daily token quota. AWS deployment remains a later explicit gate.

Agent-run observability is implemented locally. Every valid analysis receives a durable run ID, model identifiers, status, duration, and a safe error category. Successful memory writes and the run's `succeeded` transition share one CockroachDB transaction; failed model calls do not create partial memory.

Short-lived public demo sessions are implemented, and migration `0002_demo_session_access.sql` is verified on the live CockroachDB cluster. Each browser session receives an opaque bearer token, while CockroachDB stores only its SHA-256 hash. The API verifies the token, project ownership, expiry, and an atomic per-session analysis allowance before invoking Bedrock. API Gateway route throttling provides an additional coarse abuse-control layer. The AWS stack has not been deployed yet.

## Design Documents

- [MVP requirements](docs/REQUIREMENTS.md)
- [Proposed architecture](docs/ARCHITECTURE.md)
- [AWS development runbook](docs/AWS_RUNBOOK.md)

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

Validate the SAM template, build the Lambda bundle, and run a health check
against the built artifact:

```bash
npm run sam:check
```

This command is local-only. It does not deploy resources or call AWS services.

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
| CockroachDB Cloud Managed MCP Server | Provide controlled agent access to project memory. | Planned |
| Amazon Bedrock | Extract, reason over, and respond with project context. | Live Cohere embedding verified; Nova agent-memory gate pending. |
| AWS Lambda | Run the serverless agent workflow. | SAM template verified; deployment pending. |

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
- [ ] Deploy the functional demo on AWS.
- [ ] Verify security, observability, and failure handling.
- [ ] Record a public demo video under three minutes.
- [ ] Complete the Devpost project story and submission checklist.

## License

This project is licensed under the [MIT License](LICENSE).
