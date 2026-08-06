# ScopeThread MVP Requirements

Status: Implemented locally; live migration and public deployment pending

## Product Goal

ScopeThread helps independent web creators and small web production teams retain the intent behind client requirements across multiple conversations. It converts new conversation text into structured, traceable project memory and uses that memory to detect conflicts and recommend the next client questions.

## Primary User

An independent web creator or a member of a small web production team who conducts client discovery, defines website requirements, and manages revisions over time.

## Core User Story

As a web creator, I want the agent to remember prior requirements and their rationale so that I can identify contradictions, preserve revision history, and ask the right follow-up questions without rereading every conversation.

## Functional Requirements

### FR-1: Project workspace

The user can create and select a project workspace that isolates one client's memory from every other project.

Acceptance criteria:

- A project has a stable identifier, name, and creation timestamp.
- Every conversation and memory item belongs to exactly one project.
- Retrieval is always constrained to the selected project.
- Public demo access uses a short-lived opaque token whose hash is stored with the demo session.
- The API rejects a token that does not own the requested project.

### FR-2: Conversation ingestion

The user can paste fictional client conversation text into the selected project.

Acceptance criteria:

- Empty input is rejected.
- The original text is preserved as evidence.
- Repeated requests with the same idempotency key do not create duplicate records.

### FR-3: Structured memory extraction

The agent extracts candidate requirements, decisions, rationales, revisions, and open questions from the conversation.

Acceptance criteria:

- Model output is validated against a typed schema before persistence.
- Each extracted item cites its source conversation.
- Uncertain information remains proposed or open rather than becoming an active decision automatically.

### FR-4: Semantic memory retrieval

The agent retrieves relevant prior memory using embeddings stored and indexed in CockroachDB.

Acceptance criteria:

- Embeddings use a fixed, documented dimension.
- Retrieval uses a CockroachDB vector index and cosine distance.
- Queries are filtered by project before similarity ranking.
- Retrieved evidence includes stable record identifiers and source text.

### FR-5: Conflict detection

The agent compares a new request with active project memory and identifies material contradictions.

Acceptance criteria:

- A detected conflict references both the new statement and the prior decision.
- The agent asks for confirmation instead of silently replacing the prior decision.
- A false-positive conflict can be dismissed without changing project memory.

### FR-6: Decision revision

The user can confirm a change in direction while retaining the previous decision and rationale.

Acceptance criteria:

- The previous decision becomes superseded rather than deleted.
- The new decision links to the superseded decision.
- The revision records when and why the change occurred.

### FR-7: Next-question recommendation

The agent recommends the next questions needed to resolve missing or conflicting requirements.

Acceptance criteria:

- Questions are grounded in stored project memory.
- The response separates confirmed decisions from unresolved questions.
- The user can see which evidence caused each important recommendation.

### FR-8: Memory inspection

The user can inspect the project's current decisions, requirements, revisions, and open questions.

Acceptance criteria:

- Active and superseded items are visually distinguishable.
- Source conversation and rationale are accessible for each decision.
- The interface does not present semantic similarity as certainty.

## Hackathon Demo Scenario

1. The user creates a fictional website project.
2. The user enters: "The website does not need a booking feature."
3. ScopeThread stores this as an active decision with source evidence.
4. In a later session, the user enters: "Add a booking button to every page."
5. ScopeThread retrieves the earlier decision through CockroachDB vector search.
6. The agent identifies the conflict and asks whether the direction should change.
7. The user approves the change and provides a reason.
8. ScopeThread preserves the old decision, stores the replacement, and shows the revision chain.
9. A read-only MCP auditor queries the same CockroachDB memory and confirms the stored decision history.

## Quality Requirements

- **Traceability:** Important outputs must reference their stored evidence.
- **Safety:** Model output must not directly execute arbitrary SQL.
- **Isolation:** Every read and write must be scoped to a project and demo session.
- **Reliability:** External model failures must not create partial memory updates.
- **Observability:** Agent runs must record status, timing, model identifier, and error category without logging secrets.
- **Cost control:** The demo must limit input size, model calls, and anonymous session usage.
- **Privacy:** Only fictional client data will be used in the public demo and video.

## Explicit Non-Goals for the MVP

- Generating or publishing a complete website.
- Writing changes into WordPress.
- Live meeting transcription.
- Email, Slack, or CRM synchronization.
- Multi-agent autonomy.
- Production-grade customer authentication and billing.
- Processing real client or personal data.

## Definition of Done

The MVP is complete when:

- The full demo scenario runs from a public URL deployed on AWS.
- CockroachDB persists structured state, conversation evidence, embeddings, and revision history.
- Distributed Vector Indexing is exercised by the application and visible in the demo evidence.
- The Managed MCP Server can inspect the same memory through a controlled read-only workflow.
- Automated tests cover extraction validation, project isolation, conflict handling, and revision history.
- The public repository contains reproducible setup instructions and no credentials.
- The public video demonstrates the working memory flow in under three minutes.

## Open Decisions

- Verify successful runtime invocation of `global.amazon.nova-2-lite-v1:0` and `cohere.embed-multilingual-v3` through the scoped development identity.
- Apply and verify the short-lived anonymous-session migration against CockroachDB Cloud.
- Confirm CockroachDB Cloud Managed MCP authentication before the final demo.
