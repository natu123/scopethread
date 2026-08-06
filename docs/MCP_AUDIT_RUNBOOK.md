# CockroachDB Cloud MCP Audit Runbook

This runbook prepares the final hackathon demonstration of the CockroachDB Cloud Managed MCP Server. It deliberately separates repository preparation from the live authorization step.

## Audit Objective

Use a read-only MCP connection to verify that the AWS application and the MCP auditor see the same persisted project memory:

- the latest agent run;
- active and superseded decisions;
- source evidence and rationale;
- the `supersedes` link and its reason;
- the CockroachDB vector index.

The audit must not read `demo_sessions`, bearer-token hashes, embeddings, credentials, or connection strings.

## Security Gates

Use all of the following controls for the live demonstration:

1. Use OAuth rather than a long-lived service-account API key.
2. Scope the MCP connection to the single ScopeThread cluster with the `mcp-cluster-id` header.
3. In the **Authorize MCP Access** screen, grant **read** permission only. Do not grant write permission.
4. Use only the Managed MCP read tools: `select_query` and `show_statement`.
5. Do not use `list_tables`, `get_table_schema`, or any write tool during the recorded demo.
6. Query only the explicit columns and tables shown in this runbook.
7. Use fictional demo data only.

The MCP OAuth permission is the write-prevention boundary. The query allowlist is an additional data-minimization boundary that keeps the session-token table and vector values out of the model context and video.

## One-Time Local Configuration

### 1. Copy the cluster ID

Open the ScopeThread cluster overview in CockroachDB Cloud. Copy only the UUID in this URL:

```text
https://cockroachlabs.cloud/cluster/{your-cluster-id}/overview
```

Do not add the real cluster ID to the repository.

### 2. Add the single-cluster MCP configuration

Add this local-only entry to the Codex configuration file, replacing the placeholder:

```toml
[mcp_servers.cockroachdb-cloud]
url = "https://cockroachlabs.cloud/mcp"
http_headers = { "mcp-cluster-id" = "{your-cluster-id}" }
```

Restart Codex after changing its local configuration.

### 3. Authenticate through OAuth

Run:

```powershell
codex mcp login cockroachdb-cloud
```

Complete the CockroachDB Cloud browser sign-in. In **Authorize MCP Access**, select **read** only and then authorize the connection.

This authentication is an external account action. Perform it only after an explicit execution instruction.

## Local Validation

Before starting the OAuth flow, verify that the four allowlisted statements remain read-only, exclude sensitive data, use explicit limits, and reference columns present in migration `0001_initial.sql`:

```powershell
npm run validate:mcp-audit
```

This validation does not connect to CockroachDB Cloud or execute any SQL.

## Preliminary Live Verification

On 2026-08-06, the Codex connection was configured with the single-cluster header and authenticated through OAuth with read access only. No API key or authorization header was stored in `config.toml`, and no write tool was invoked.

The allowlisted MCP tools verified:

- `SHOW INDEXES FROM defaultdb.public.memory_items` returns `memory_items_embedding_idx` with `project_id` followed by `embedding`;
- the latest succeeded run is the Cohere embedding verification run with a null error code;
- its fictional active decision, rationale, and source quote are persisted;
- the query excludes the embedding value, demo sessions, token hashes, and credentials.

The preliminary run has no `supersedes` link because it predates the pending Nova conflict-and-revision flow. Do not present this preliminary result as the final decision-chain audit. Repeat the full procedure below with the public application run ID after Nova quota activation.

## Live Audit Procedure

### 1. Capture the run ID

Complete the ScopeThread conflict-and-revision scenario in the web application. Copy the successful agent run ID displayed by the application.

### 2. Verify the agent run

Replace `{agent-run-id}` and ask the MCP auditor to execute exactly this one read-only statement:

```sql
SELECT
  ar.id AS agent_run_id,
  p.name AS project_name,
  ar.status,
  ar.chat_model_id,
  ar.embedding_model_id,
  ar.duration_ms,
  ar.error_code,
  ar.created_at
FROM defaultdb.public.agent_runs AS ar
JOIN defaultdb.public.projects AS p ON p.id = ar.project_id
WHERE ar.id = '{agent-run-id}'
LIMIT 1;
```

Expected evidence:

- one row is returned;
- `status` is `succeeded`;
- the model identifiers match the live application run;
- `error_code` is null.

### 3. Verify persisted memory

Run this as a separate `select_query` call:

```sql
SELECT
  mi.id,
  mi.kind,
  mi.status,
  mi.content,
  mi.rationale,
  mi.source_quote,
  mi.confidence,
  mi.created_at,
  mi.updated_at
FROM defaultdb.public.memory_items AS mi
WHERE mi.project_id = (
  SELECT project_id
  FROM defaultdb.public.agent_runs
  WHERE id = '{agent-run-id}'
)
ORDER BY mi.created_at, mi.id
LIMIT 25;
```

Expected evidence:

- the original decision and the replacement are both present;
- the original has `superseded` status;
- the replacement has `active` status;
- source quotes and rationale remain attached to the records;
- the `embedding` column is not returned.

### 4. Verify the revision link

Run this as a separate `select_query` call:

```sql
SELECT
  ml.relation,
  newer.id AS replacement_id,
  newer.content AS replacement,
  older.id AS prior_id,
  older.content AS prior_decision,
  ml.reason,
  ml.created_at
FROM defaultdb.public.memory_links AS ml
JOIN defaultdb.public.memory_items AS newer ON newer.id = ml.from_memory_id
JOIN defaultdb.public.memory_items AS older ON older.id = ml.to_memory_id
WHERE ml.project_id = (
  SELECT project_id
  FROM defaultdb.public.agent_runs
  WHERE id = '{agent-run-id}'
)
  AND ml.relation = 'supersedes'
ORDER BY ml.created_at DESC
LIMIT 10;
```

Expected evidence:

- the replacement points to the prior decision;
- `relation` is `supersedes`;
- the user-provided revision reason is preserved.

### 5. Verify the vector index

Use `show_statement` to execute:

```sql
SHOW INDEXES FROM defaultdb.public.memory_items;
```

Expected evidence:

- `memory_items_embedding_idx` is present;
- the index definition includes the project prefix and vector embedding column.

## Recording Checklist

- Show the application run ID before opening the MCP result.
- Show only the allowlisted result columns above.
- Keep the cluster ID, account identity, browser tabs, and local configuration outside the captured frame.
- Do not open `demo_sessions` or reveal `token_hash`.
- Do not ask the agent to discover tables or generate arbitrary SQL.
- Stop if the authorization screen shows write access.

## Completion Record

Record the following after the live audit without adding credentials or full query results:

```text
Date:
Cluster scope: single cluster
Authentication: OAuth
Authorization: read only
Agent run verified: yes/no
Decision chain verified: yes/no
Vector index verified: yes/no
Unexpected data exposure: yes/no
```

## Disconnect

After recording the demo, disconnect or revoke the MCP OAuth session from the client or CockroachDB Cloud. Never copy OAuth tokens into repository files, issue comments, screenshots, or the submission story.

## References

- [Connect to the CockroachDB Cloud MCP Server](https://www.cockroachlabs.com/docs/cockroachcloud/connect-to-the-cockroachdb-cloud-mcp-server)
- [CockroachDB Cloud authorization](https://www.cockroachlabs.com/docs/cockroachcloud/authorization)
