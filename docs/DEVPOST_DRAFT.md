# ScopeThread Devpost Draft

> Submission status: Draft only. Do not publish until every item in the final verification checklist is complete.

## Project tagline

Never lose the thread of client decisions.

## About the project

### Inspiration

Website projects rarely lose requirements because nobody took notes. They lose the reasoning that connected those notes.

A client may say that online booking is unnecessary during an early meeting, then ask for a booking button weeks later. A transcript can show both messages, but it does not explain which decision is current, why it changed, or what the creator should ask next. Independent web creators and small production teams need durable project memory, not another chat window.

ScopeThread was inspired by that gap. It treats client conversations as evidence and turns them into structured, traceable memory that can guide the next action.

### What it does

ScopeThread is an agentic-memory application for website requirements and decision history.

It can:

- ingest fictional client conversations;
- extract requirements, decisions, rationales, and open questions;
- store source quotes alongside every important memory;
- retrieve related memories with CockroachDB vector search;
- detect conflicts between new requests and active decisions;
- ask for confirmation instead of silently overwriting history;
- preserve superseded decisions and the reason for each revision;
- dismiss a false-positive conflict without changing the active decision;
- restore persisted memory after a browser reload;
- expose an auditable agent-run record without logging client text or credentials.

The core demo begins with an active decision that online booking is not needed. A later conversation requests a booking button on every page. ScopeThread retrieves the earlier decision, identifies the conflict, and asks whether the direction changed. When the creator confirms the revision, the old decision becomes `superseded`, the replacement becomes `active`, and CockroachDB retains the explicit `supersedes` link and its reason.

### Why this is agentic memory

ScopeThread is not a chatbot with a long transcript. Its stored memory changes what the agent does next.

Structured memory remains authoritative for current project state. Vector retrieval reconnects new evidence with semantically related historical decisions. The agent uses both forms of memory to determine whether it should extract a new requirement, flag a conflict, preserve the existing decision, or recommend a follow-up question.

### How we built it

The application is a TypeScript monorepo with four main layers:

1. A React and Vite browser interface for entering evidence and inspecting memory.
2. An AWS Lambda API behind API Gateway for session control and agent workflows.
3. Amazon Bedrock adapters for Cohere Embed Multilingual v3 and Amazon Nova 2 Lite.
4. CockroachDB Cloud for relational memory, conversation evidence, vector embeddings, revision links, and durable agent-run records.

CockroachDB stores `VECTOR(1024)` embeddings with a project-prefixed cosine vector index. Every retrieval query is scoped to one project before similarity ranking. The application stores conversations, extracted memories, conflict links, and successful run status in controlled transactions so a model or database failure cannot create a partially successful memory update.

The public-demo design uses short-lived bearer tokens. Only SHA-256 token hashes are stored, and CockroachDB atomically enforces each session's expiry, project ownership, and analysis allowance before Bedrock is called.

The AWS infrastructure is defined with SAM. It includes Lambda, an HTTP API, a private S3 origin, CloudFront, scoped Bedrock and Parameter Store access, API throttling, a 16 KiB request-body guard, 14-day log retention, and browser security headers. Secret-bearing operations and paid live tests use explicit `--apply` gates and refuse root credentials.

The CockroachDB Cloud Managed MCP Server is designed as a separate read-only operator path. Its final demo will use OAuth, one-cluster scoping, read-only authorization, and allowlisted audit queries to inspect the same decision history created by the AWS application.

### Challenges we faced

#### Preserving history without losing the current truth

The application could not simply update a decision in place. We modeled revisions as an atomic state transition plus an explicit graph edge: the prior decision becomes `superseded`, the replacement becomes `active`, and the reason is retained on the `supersedes` link.

#### Treating model output as untrusted input

The agent returns structured JSON, but generated output is not accepted directly. ScopeThread validates it with Zod before persistence. A malformed model response fails the run without creating conversation or memory records.

#### Combining semantic recall with strict isolation

Vector similarity is useful only after the project boundary is enforced. The CockroachDB vector index begins with `project_id`, and retrieval queries filter by that project before ordering by cosine distance.

#### Designing a public demo without exposing costly or privileged operations

Anonymous model access needed multiple layers of control. ScopeThread combines short-lived sessions, hashed tokens, per-session analysis limits, API Gateway throttling, request-size limits, scoped IAM permissions, and guarded deployment scripts.

#### Keeping deployment access narrow

The first deployment bootstrap reached the IAM user's aggregate inline-policy size limit. Instead of broadening the user or switching to administrator access, we moved only the deployment permissions into a customer-managed policy. SAM deployment then exposed three resource-level details: the transform ARN, both stack and change-set ARNs during execution, and the API Gateway tag endpoint. We added only those exact paths. The final bootstrap separates the development user, CloudFormation service role, Lambda execution role, and artifact bucket, and the application deployer can pass only the fixed CloudFormation role for the fixed stack.

#### External model activation

The Cohere embedding path required accepting the third-party model agreement before live inference. Amazon Nova live verification also depends on the AWS account's available model quota. AWS Support confirmed that the Singapore request is under review and that Tokens per day scales automatically with an approved Tokens per minute increase. The repository keeps this external account state separate from code-level completion and does not claim live verification before it succeeds.

### What we learned

- Agentic memory needs explicit state transitions, not only better prompts.
- Semantic retrieval should locate evidence, while structured records decide what is currently true.
- A durable run ID connects user-visible behavior, model metadata, failures, and database changes without logging sensitive conversation content.
- Idempotency and transactional persistence matter because model calls and browser retries fail in different ways.
- Managed MCP access is most useful as a controlled audit path when the public application already has a narrow runtime API.
- Security gates are easier to trust when they are executable checks rather than prose-only warnings.

### Accomplishments we are proud of

- A complete domain workflow with extraction, retrieval, conflict detection, revision, and dismissal behavior.
- CockroachDB-backed memory that survives a browser reload.
- A project-prefixed distributed vector index verified with live multilingual embeddings.
- Durable agent-run observability with allowlisted failure categories.
- Atomic public-session authorization and analysis allowances.
- A least-privilege runtime SQL role that excludes deletion, DDL, and privilege delegation.
- Reproducible local, SAM, browser, and guarded live-E2E verification paths.

### What's next

- Complete the live Amazon Nova quota gate.
- Run the guarded public demo E2E from the CloudFront URL.
- Repeat the read-only CockroachDB Cloud Managed MCP audit with the public Nova run and verify its revision chain.
- Record the final video and replace all submission placeholders.

## Built with

Suggested Devpost tags:

1. CockroachDB.
2. CockroachDB Cloud.
3. Distributed Vector Indexing.
4. Model Context Protocol.
5. AWS.
6. Amazon Bedrock.
7. Amazon Nova.
8. AWS Lambda.
9. Amazon API Gateway.
10. Amazon S3.
11. Amazon CloudFront.
12. AWS SAM.
13. TypeScript.
14. React.
15. Vite.
16. Node.js.
17. Zod.
18. Cohere Embed Multilingual v3.

## Submission links

- Source code: https://github.com/natu123/scopethread
- Public demo: [https://d2kn7tl59k7usc.cloudfront.net/](https://d2kn7tl59k7usc.cloudfront.net/)
- Video demo: `[VIDEO_DEMO_URL]`

## Video outline

Target duration: 2 minutes 40 seconds.

| Time | Scene | Evidence to show |
| --- | --- | --- |
| 0:00-0:20 | Problem and product | Explain why transcripts lose decision context. |
| 0:20-0:40 | Initial project memory | Show the active no-booking decision and source quote. |
| 0:40-1:15 | Live agent analysis | Submit the later booking request and show the grounded conflict and run ID. |
| 1:15-1:45 | Confirm the revision | Enter the reason and show the old decision become superseded. |
| 1:45-2:05 | Reload persistence | Reload the page and show the same revision chain from CockroachDB. |
| 2:05-2:25 | Managed MCP audit | Show the read-only query returning the same run and decision chain. |
| 2:25-2:40 | Architecture and close | Show CockroachDB, Bedrock, and the agentic-memory data flow. |

## Final verification checklist

- [x] Confirm the public demo link uses the verified CloudFront URL.
- [ ] Replace `[VIDEO_DEMO_URL]` with the public video URL.
- [ ] Verify Nova live inference from `scopethread-dev`.
- [ ] Verify the live public E2E succeeds from the deployed stack.
- [x] Verify the MCP OAuth connection is single-cluster and read-only.
- [ ] Confirm the video contains no account IDs, cluster IDs, tokens, credentials, or real client data.
- [ ] Confirm every accomplishment above has current evidence.
- [ ] Re-read the current hackathon rules before submission.
- [ ] Remove this draft warning only after all checks pass.
