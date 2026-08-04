# ScopeThread

> Never lose the thread of client decisions.

ScopeThread is a persistent-memory agent for web production requirements. It turns client conversations into traceable requirements, decisions, revisions, open questions, and next-step prompts without losing the context behind them.

## Status

ScopeThread is in the planning and early development stage. The architecture and technology choices below are provisional until the first end-to-end demo is verified.

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
| CockroachDB Distributed Vector Indexing | Retrieve semantically related conversations and decisions. | Planned |
| CockroachDB Cloud Managed MCP Server | Provide controlled agent access to project memory. | Planned |
| Amazon Bedrock | Extract, reason over, and respond with project context. | Planned |
| AWS Lambda | Run the serverless agent workflow. | Planned |

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

- [ ] Confirm the MVP requirements and technology stack.
- [ ] Define the database schema and memory lifecycle.
- [ ] Build one end-to-end memory workflow.
- [ ] Add conflict detection and next-question generation.
- [ ] Deploy the functional demo on AWS.
- [ ] Verify security, observability, and failure handling.
- [ ] Record a public demo video under three minutes.
- [ ] Complete the Devpost project story and submission checklist.

## License

This project is licensed under the [MIT License](LICENSE).
