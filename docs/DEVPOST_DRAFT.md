# ScopeThread Devpost Draft

> Submission status: Final draft. Do not publish until the remaining external-action checklist items receive explicit approval.

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
- switch between an English-first interface and natural Japanese analysis;
- expose an auditable agent-run record without logging client text or credentials.

The core demo begins with an active decision that online booking is not needed. A later conversation requests a booking button on every page. ScopeThread retrieves the earlier decision, identifies the conflict, and asks whether the direction changed. When the creator confirms the revision, the old decision becomes `superseded`, the replacement becomes `active`, and CockroachDB retains the explicit `supersedes` link and its reason.

The interface presents this choice as two direct actions: adopt the new direction or keep the current decision. The underlying conflict and dismissal records remain available for audit, while the user-facing language stays focused on the project decision being made.

### Why this is agentic memory

ScopeThread is not a chatbot with a long transcript. Its stored memory changes what the agent does next.

Structured memory remains authoritative for current project state. Vector retrieval reconnects new evidence with semantically related historical decisions. The agent uses both forms of memory to determine whether it should extract a new requirement, flag a conflict, preserve the existing decision, or recommend a follow-up question.

### How we built it

The application is a TypeScript monorepo with four main layers:

1. A React and Vite browser interface for entering evidence and inspecting memory.
2. An AWS Lambda API behind API Gateway for session control and agent workflows.
3. Amazon Bedrock adapters for Cohere Embed Multilingual v3 and Amazon Nova 2 Lite.
4. CockroachDB Cloud for relational memory, conversation evidence, vector embeddings, revision links, and durable agent-run records.

The interface keeps English as the default for hackathon review and offers a persistent Japanese switch. The locale is sent to the analysis layer, where both the Nova prompt and deterministic fallback produce natural localized output while retaining source quotes exactly as evidence. The translation layer is intentionally extensible, but the MVP validates English and Japanese deeply before adding more languages.

CockroachDB stores `VECTOR(1024)` embeddings with a project-prefixed cosine vector index. Every retrieval query is scoped to one project before similarity ranking. The application stores conversations, extracted memories, conflict links, and successful run status in controlled transactions so a model or database failure cannot create a partially successful memory update.

The public-demo design uses short-lived bearer tokens. Only SHA-256 token hashes are stored, and CockroachDB atomically enforces each session's expiry, project ownership, and analysis allowance before Bedrock is called.

The AWS infrastructure is defined with SAM. It includes Lambda, an HTTP API, a private S3 origin, CloudFront, scoped Bedrock and Parameter Store access, API throttling, a 16 KiB request-body guard, 14-day log retention, and browser security headers. Secret-bearing operations and paid live tests use explicit `--apply` gates and refuse root credentials.

The CockroachDB Cloud Managed MCP Server provides a separate read-only operator path. The verified workflow uses OAuth, one-cluster scoping, read-only authorization, and allowlisted audit queries to inspect the same decision history created by the AWS application.

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

The Cohere embedding path required accepting the third-party model agreement before live inference. Nova 2 Lite initially returned zero-quota throttling, so we kept account activation separate from code completion and requested review through AWS Support. AWS approved the global cross-region inference profile on 2026-08-07, and the direct agent-memory E2E then completed live conflict detection and transactional memory persistence. The first public E2E exposed a different issue: generated output could still fail strict schema or grounding validation. ScopeThread rejected that output without partial memory, and we added bounded, cause-specific repair guidance without sending raw model output back into the repair prompt. After that repair was deployed, a second public run still failed at the validation boundary. A third run with allowlisted telemetry identified an unlinked conflict, so the host now links the conflict deterministically when exactly one extracted memory has a source quote copied from the conversation while continuing to reject ambiguous cases. The final deployed fix completed the public analysis and revision workflow, and a read-only CockroachDB query verified the persisted decision chain.

Japanese output exposed one more reliability boundary: a fluent-looking model quote could still differ from the actual conversation. ScopeThread now gives Nova host-owned evidence IDs, resolves those IDs back to exact source text, performs one bounded review when a likely conflict is missing, and keeps every new decision proposed until explicit confirmation. Critical conflict explanation and confirmation copy is normalized by the host in English and Japanese, while the model still selects the grounded evidence and relationship.

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

- Add authenticated team workspaces while preserving the current project-isolation boundary.
- Expand requirement and decision templates for more web-production workflows, including WordPress delivery constraints.
- Evaluate additional languages with the same source-quote and terminology checks used for English and Japanese.
- Add configurable retention and export controls for production client projects.

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
- Video demo: [https://www.youtube.com/watch?v=T7881nwgDD0](https://www.youtube.com/watch?v=T7881nwgDD0)

## Additional info

### Functional demo

- URL: https://d2kn7tl59k7usc.cloudfront.net/
- Testing credentials or instructions:

  No credentials are required. The public demo uses fictional project data and issues a short-lived session automatically. Review the active decision, submit the prefilled later client request with **Analyze memory**, then either adopt the new direction with a reason or keep the current decision. Reload the page to verify that the revision history persists. The language switch can be used to repeat the analysis in natural Japanese.

### Source and license

- Public repository: https://github.com/natu123/scopethread
- Open-source license: https://github.com/natu123/scopethread/blob/main/LICENSE

### CockroachDB tools

- Cloud Managed MCP Server.
- Distributed Vector Indexing.

### AWS services

- Amazon Bedrock.
- AWS Lambda.
- Amazon S3.
- Other AWS service: Amazon API Gateway, Amazon CloudFront, AWS Systems Manager Parameter Store, AWS CloudFormation, and AWS SAM.

### Meaningful integration

ScopeThread runs its public agent workflow in AWS Lambda behind API Gateway. Lambda calls Amazon Bedrock to create Cohere multilingual embeddings and to analyze grounded evidence with Amazon Nova 2 Lite. It stores conversations, structured decisions, exact source quotes, 1,024-dimension vectors, revision links, and agent-run telemetry in CockroachDB Cloud. CockroachDB Distributed Vector Indexing retrieves project-scoped related memories before analysis, while relational transactions preserve the authoritative decision state and revision chain. A separate single-cluster, OAuth, read-only CockroachDB Cloud Managed MCP connection audits the same successful agent run, decision chain, and vector index. Amazon S3 and CloudFront publish the browser application.

### Project provenance

- Project start date: `08-04-26`.
- Pre-existing work:

  No pre-existing ScopeThread application code was incorporated. The project was created during the submission period. It uses standard open-source frameworks and libraries, AWS SAM templates, vendor SDKs, and AI coding assistants as development tools. All project-specific requirements, domain models, database migrations, application code, infrastructure, tests, documentation, and demo materials were produced for this project during the submission period.

### CockroachDB feedback

The combination of relational transactions and vector search made it possible to keep the current decision authoritative without discarding semantic history. The Managed MCP Server was especially useful as a separate read-only audit path. Clearer visibility into OAuth cluster scope and authorization mode inside the connection UI would make security review easier, and a small set of documented agent-memory reference patterns would help teams move from a vector-search prototype to durable state transitions more quickly.

### AI tools used

- OpenAI Codex and ChatGPT for assisted development, diagnosis, review, and documentation.
- Microsoft Clipchamp AI text-to-speech and automatic captions for the demo video.

### Submitter confirmations still requiring the submitter

The following answers must be confirmed by the submitter and must not be inferred from repository data:

- Submitter type.
- Country of residence.
- Organization name, if applicable.
- Learning level.
- Whether the project produced career-relevant AI value.
- Sponsor, affiliate, and government-employee eligibility.
- Eligible-jurisdiction confirmation.
- Age-of-majority confirmation.
- Agreement to the Official Rules and Devpost Terms of Service.

## Video outline

Published duration: 2 minutes 14 seconds.

The final English narration, on-screen actions, recording gate, and redaction review are defined in [`DEMO_VIDEO_SCRIPT.md`](./DEMO_VIDEO_SCRIPT.md).

| Time | Scene | Evidence to show |
| --- | --- | --- |
| 0:00-0:18 | Problem and product | Explain why transcripts lose decision context. |
| 0:18-0:38 | Initial project memory | Show the active no-booking decision and source quote. |
| 0:38-1:04 | Live agent analysis | Submit the later booking request and show the grounded conflict and run ID. |
| 1:04-1:25 | Confirm the revision | Enter the reason and show the old decision become superseded. |
| 1:25-1:41 | Reload and locale | Show persistence after reload and the English/Japanese interface. |
| 1:41-2:01 | Managed MCP audit | Show the read-only evidence for the same run and decision chain. |
| 2:01-2:14 | Architecture and close | Show CockroachDB, Bedrock, and the agentic-memory data flow. |

## Final verification checklist

- [x] Confirm the public demo link uses the verified CloudFront URL.
- [x] Confirm the GitHub repository is public, displays its MIT license, and links to the public demo.
- [x] Confirm the public YouTube video URL is included in the submission links.
- [x] Verify Nova live inference from `scopethread-dev`.
- [x] Verify the live public E2E succeeds from the deployed stack.
- [x] Deploy the bounded conflict-review and host-owned evidence fixes, then verify the Japanese public analysis path.
- [x] Verify the MCP OAuth connection is single-cluster and read-only.
- [x] Verify the final Managed MCP audit returns the successful public run, revision chain, and vector index without write operations or unexpected data exposure.
- [x] Confirm the video contains no account IDs, cluster IDs, tokens, credentials, or real client data.
- [x] Complete the final-take duration, behavior, redaction, and caption review in `DEMO_VIDEO_SCRIPT.md`.
- [x] Confirm every accomplishment above has current evidence in `SUBMISSION_READINESS.md`.
- [x] Re-read the current hackathon rules before submission.
- [ ] Revoke or disconnect the Managed MCP OAuth session after submission evidence no longer needs the live connection.
- [ ] Remove this draft warning and submit only after explicit approval.
