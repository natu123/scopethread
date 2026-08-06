# ScopeThread MVP Architecture

Status: AWS API and demo-session persistence verified live; Nova inference and web publication pending

## Decision Summary

| Area | Proposed choice | Reason |
| --- | --- | --- |
| Language | TypeScript | One language across the browser, API, validation, and tests. |
| Frontend | React with Vite | Small static application with a fast local feedback loop. |
| Frontend hosting | Amazon S3 and CloudFront | Keeps the public demo on AWS without a long-running web server. |
| API | Amazon API Gateway HTTP API | Lightweight public HTTP entry point with throttling and CORS support. |
| Compute | AWS Lambda on Node.js | Serverless execution that fits the short request-driven workflow. |
| Model API | Amazon Bedrock Runtime | Provides generation and embedding models inside AWS. |
| Chat model | Amazon Nova 2 Lite | Uses the cost-efficient `global.amazon.nova-2-lite-v1:0` inference profile from Singapore. |
| Embedding model | Cohere Embed Multilingual v3 | Supports multilingual retrieval and returns 1024-dimensional vectors. |
| Database | CockroachDB Cloud | One system of record for relational state, evidence, and vectors. |
| Database access | `pg` with parameterized SQL | Direct CockroachDB-compatible SQL and explicit vector queries. |
| Validation | Zod | Rejects malformed model and API output before persistence. |
| Infrastructure | AWS SAM | Small declarative deployment for Lambda, API Gateway, and related resources. |
| Tests | Vitest | Fast TypeScript tests for domain behavior and adapters. |

## System Context

```text
Browser
  |
  v
CloudFront --> S3 static web application
  |
  v
API Gateway HTTP API
  |
  v
AWS Lambda
  |-- Bedrock chat model
  |-- Cohere Embed Multilingual v3
  |
  v
CockroachDB Cloud
  |-- Structured project memory
  |-- Conversation evidence
  |-- VECTOR(1024) semantic memory
  |-- Agent run audit records

Read-only operator path:
AI coding or auditing client
  |
  v
CockroachDB Cloud Managed MCP Server
  |
  v
The same CockroachDB project memory
```

## Why MCP Is a Separate Operator Path

The public application needs narrowly scoped reads and writes for one demo session. The Managed MCP Server is more appropriate for a controlled AI operator that inspects the live schema and verifies memory records through an auditable, read-only connection.

The application will therefore use a least-privilege SQL account for runtime operations. The MCP auditor will use a separate OAuth connection, restricted to the ScopeThread cluster with the `mcp-cluster-id` header and authorized for read access only. MCP credentials will not be placed in browser code, Lambda environment variables, or the public repository. The demo will show the MCP auditor querying the same memory created by the AWS application.

This separation keeps both CockroachDB integrations meaningful:

- **Distributed Vector Indexing:** Used directly by the application for project-scoped semantic recall.
- **Managed MCP Server:** Used by a read-only memory auditor to inspect and explain stored decisions and revision history.

## Request Flow

### Analyze a new conversation

1. The browser sends its short-lived bearer token, project ID, conversation text, and an idempotency key to API Gateway.
2. Lambda hashes the token and atomically verifies project ownership, expiry, and the remaining analysis allowance in CockroachDB.
3. Lambda creates a query embedding with Cohere Embed Multilingual v3.
4. Lambda retrieves active structured memory and semantically similar memory for the project.
5. Lambda sends the new text and retrieved evidence to the configured Bedrock chat model.
6. Lambda validates the model's structured response with Zod.
7. Lambda writes the conversation, extracted memory, conflicts, open questions, and agent-run metadata in a CockroachDB transaction.
8. Lambda returns a grounded analysis with evidence identifiers.

### Confirm a revision

1. The browser submits the proposed replacement, reason, and prior decision ID.
2. Lambda verifies that the prior decision is active and belongs to the same project.
3. A CockroachDB transaction marks the prior decision as superseded and inserts the replacement.
4. The transaction stores an explicit revision edge between the two decisions.
5. Lambda returns the updated decision chain.

### Dismiss a false-positive conflict

1. The browser submits the stored conflict proposal, prior decision ID, and dismissal reason.
2. Lambda verifies that the proposal belongs to the successful agent run and the same project.
3. A CockroachDB transaction locks both memories, leaves the prior active decision unchanged, and marks only the proposed replacement as dismissed.
4. The dismissal reason remains available through memory inspection after a page reload.

### Inspect persisted memory

1. The browser sends its bearer token and project ID to `GET /memory`.
2. Lambda verifies that the unexpired session owns the project without consuming an analysis allowance.
3. CockroachDB returns project-scoped memory items and links, including source quotes and revision reasons.
4. The browser derives current counts and reconstructs the latest supersession chain from the persisted snapshot.

## Data Boundaries

The detailed schema will be defined separately, but the MVP needs these logical records:

- `demo_sessions` for short-lived public demo isolation, hashed bearer tokens, and atomic analysis allowances.
- `projects` for the client project boundary.
- `conversations` for immutable source evidence.
- `memory_items` for requirements, decisions, rationales, and open questions.
- `memory_links` for supersession, support, and conflict relationships.
- `agent_runs` for model, timing, status, and error metadata.

The vector column will live with retrievable memory and use a project-scoped prefix:

```sql
embedding VECTOR(1024)
```

The intended index uses cosine distance and a project prefix so retrieval cannot mix projects:

```sql
VECTOR INDEX memory_embedding_idx (project_id, embedding vector_cosine_ops)
```

The exact DDL remains subject to verification against the selected CockroachDB Cloud version.

## Failure and Consistency Strategy

- Bedrock calls occur before the final database transaction to avoid holding a transaction open across network inference.
- No extracted memory is persisted until the model output passes schema validation.
- The final memory update is transactional.
- Idempotency keys prevent duplicate conversations after client retries.
- A failed embedding or generation call returns a retryable error and does not create partial memory.
- A failed revision transaction leaves the prior decision active.
- The UI displays failure states without inventing a successful memory update.

## Security Strategy

- Use fictional data only in the public demo.
- Never expose database, AWS, or MCP credentials to the browser.
- Fail the repository verification if tracked files contain common AWS keys, private keys, credential-bearing database URLs, account IDs, or local secret environment files.
- Use parameterized SQL and allowlisted operations rather than model-generated SQL.
- Use separate database identities for schema migration and application runtime; keep Managed MCP access in its separate Cloud OAuth path.
- Grant the runtime database identity only the table-level `SELECT`, `INSERT`, and `UPDATE` operations used by the Lambda workflow; do not grant deletion, DDL, or privilege delegation.
- Restrict the Managed MCP connection to one cluster, authorize read access only, and use an explicit audit-query allowlist.
- Scope all application queries by demo session and project.
- Store only SHA-256 hashes of opaque demo-session bearer tokens; never store or log token plaintext.
- Reject expired, cross-project, and exhausted sessions before any Bedrock invocation.
- Apply API Gateway throttling to every route and a stricter limit to session creation.
- Store the CockroachDB connection string as a standard Parameter Store `SecureString`; Lambda retrieves it once per cold start and never logs it.
- Validate the decrypted runtime URL against the fixed SQL identity, database, password presence, and verified TLS before creating the cached connection pool; normalize SSM failures without retaining raw error details.
- Restrict Lambda IAM permissions to the selected Bedrock models and required AWS resources.
- Bootstrap a dedicated CloudFormation service role and Lambda execution role once; allow `scopethread-dev` to pass only the fixed CloudFormation role for the fixed application stack.
- Keep SAM artifacts in a private, encrypted, versioned bucket and prohibit direct root deployment of the application stack.
- Apply API request-size limits, throttling, and basic abuse controls before making the demo public.
- Reject POST bodies larger than 16 KiB before session authorization, database access, or Bedrock invocation.
- Attach CloudFront response headers for CSP, HSTS, clickjacking prevention, MIME sniffing prevention, and referrer control.

## Observability

- AWS Lambda logs include request ID, run ID, duration, result category, and model identifier.
- Logs exclude conversation content, embeddings, credentials, and connection strings.
- The Lambda log group retains operational logs for 14 days and is deleted with the demo stack.
- CockroachDB stores durable `agent_runs` records for user-visible traceability.
- A run is inserted as `started` before external model calls. Successful memory persistence and the transition to `succeeded` commit in the same transaction; failures store an allowlisted error category without raw exception messages.
- MCP access remains auditable through the CockroachDB Cloud operator workflow.

## Planned Repository Layout

```text
scopethread/
  apps/
    web/                 # React and Vite frontend
    api/                 # Lambda handlers
  packages/
    core/                # Domain types, validation, and use cases
    database/            # Queries, migrations, and CockroachDB adapter
    bedrock/             # Chat and embedding adapters
  infra/
    template.yaml        # AWS SAM template
  docs/
    REQUIREMENTS.md
    ARCHITECTURE.md
  tests/
  .env.example
  README.md
```

## Staged Delivery

1. Build and test the domain workflow with fake Bedrock and in-memory adapters.
2. Add CockroachDB migrations and integration tests.
3. Connect Bedrock generation and multilingual embeddings.
4. Build the three-screen web interface.
5. Deploy Lambda and API Gateway.
6. Deploy the static frontend through S3 and CloudFront.
7. Connect and verify the read-only MCP auditor.
8. Run the public demo, cost, security, and submission checks.

## Current Delivery State

- AWS CLI v2 and browser-based temporary authentication are verified.
- The Singapore Bedrock catalog reports `cohere.embed-multilingual-v3`, `amazon.nova-2-lite-v1:0`, and `global.amazon.nova-2-lite-v1:0` as active.
- The CockroachDB Cloud connection, migrations, structured demo memory, and vector index are verified.
- Live Cohere embedding inference is verified through `scopethread-dev`; Nova agent-memory inference remains pending quota activation.
- The one-time AWS deployment bootstrap and application stack are live; static web publication and CockroachDB Cloud Managed MCP verification remain pending.
- The Managed MCP read-only audit runbook is prepared; live OAuth authorization and verification remain pending.
- Public demo-session controls pass local API, database, SAM, and browser E2E verification. Migration `0002_demo_session_access.sql` is applied and its columns and token index are verified on the live cluster.
- Migration `0003_runtime_role.sql` is applied on the live cluster. The `scopethread_runtime` role is verified as `NOLOGIN`, its six-table grant set matches the least-privilege design, and the built-in `public` role no longer has public-schema `CREATE`.
- The live `scopethread_app` login inherits only `scopethread_runtime`; a real runtime connection verifies its identity, table privileges, schema boundary, and read access. Its connection string is stored as the fixed Parameter Store Standard `SecureString`; metadata verification excludes the encrypted value.
- The `ScopeThreadBedrockDevelopment` inline policy is applied to `scopethread-dev`. The AWS copy matches the repository JSON, and IAM simulation verifies the fixed SSM parameter and selected Bedrock model allows plus denials for unrelated resources and administrative actions.
- The guarded deployment bootstrap is live with all four resources at `CREATE_COMPLETE`; the artifact bucket is verified in Singapore through `scopethread-dev`. The application deployer is implemented locally, both templates pass SAM lint, and live application deployment remains an explicit gate.
- The `scopethread` application stack is live with all 15 resources at `CREATE_COMPLETE`. API health is ready, and a no-Bedrock smoke test verifies Lambda SSM decryption, runtime SQL login, demo-session persistence, and project-memory reload without printing the bearer token.

Cloud mutations and paid model invocations require an explicit execution gate. The live vector-memory script also verifies its AWS caller and refuses root credentials.

## References

- [CockroachDB Cloud Managed MCP Server](https://www.cockroachlabs.com/docs/cockroachcloud/connect-to-the-cockroachdb-cloud-mcp-server)
- [CockroachDB Vector Indexes](https://www.cockroachlabs.com/docs/stable/vector-indexes)
- [Cohere Embed Multilingual on Amazon Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-cohere-embed-multilingual.html)
- [Amazon Bedrock Runtime examples for JavaScript](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_bedrock-runtime_code_examples.html)
- [AWS Lambda Node.js handlers](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html)
- [API Gateway integration with AWS Lambda](https://docs.aws.amazon.com/lambda/latest/dg/services-apigateway.html)
- [Managing AWS SAM permissions with CloudFormation mechanisms](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-permissions-cloudformation.html)
- [CloudFormation service roles](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-iam-servicerole.html)
- [Hackathon official rules](https://cockroachdb-ai.devpost.com/rules)
