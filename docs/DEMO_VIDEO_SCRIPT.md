# ScopeThread Demo Video Script

Final duration: 2 minutes 14 seconds. The public YouTube upload remains under the three-minute limit.

The final 50-cue English caption track is available in [`assets/demo-video-captions.srt`](./assets/demo-video-captions.srt). It follows the same seven scene segments and narration as this script.

## Recording gate

The Managed MCP gate was satisfied on 2026-08-07: the allowlisted audit in `MCP_AUDIT_RUNBOOK.md` returned the successful public run, its revision chain, and the vector index through the single-cluster read-only connection. Use only fictional client content. Keep browser developer tools, address-bar query strings, AWS account details, CockroachDB cluster details, terminal environment variables, and authentication screens out of frame.

Do not reuse the pre-audit diagnostic capture because one tool output displayed the cluster ID. Use only the final allowlisted query results, cropped to the documented columns. The diagnostic contained no credential or OAuth token, but it is not approved recording material.

## Capture setup

- Use a 1920 x 1080 canvas and record the browser content area at 100% zoom.
- In OBS Studio, use a 1920 x 1080 base and output canvas at 30 frames per second.
- Record with OBS Hybrid MP4. This keeps the interrupted-recording resilience of fragmented MP4 while producing an upload-ready MP4 without a separate remux step.
- Use application-window capture sources rather than full-display capture. This keeps unrelated tabs, notifications, account details, and the pre-audit diagnostic output outside the recording surface.
- Prepare three scenes before recording: **Public demo**, **Managed MCP evidence**, and **Architecture close**.
- The final edit uses English text-to-speech narration at 1.0x speed, no background music, and no microphone recording.
- Use the English interface for the main workflow, then show the Japanese switch briefly.
- Prepare the public demo, the sanitized read-only MCP result in [`assets/mcp-audit-evidence.svg`](./assets/mcp-audit-evidence.svg), and the architecture visual before recording.
- Reset the demo to the known fictional booking scenario before the take.
- Crop the MCP result to the allowlisted columns documented in `MCP_AUDIT_RUNBOOK.md`.
- For the MCP scene, show the succeeded run, `superseded` and `active` decision states, the `supersedes` relation, and `memory_items_embedding_idx`; do not show configuration or discovery output.
- Do not display account IDs, cluster IDs, database URLs, OAuth screens, bearer tokens, passwords, request headers, or real client data.

## Timed storyboard and narration

### 0:00-0:18 — Problem and product

**On screen:** Open the ScopeThread landing page and move directly to the demo workspace.

**Narration:**

> Website projects rarely lose requirements because nobody took notes. They lose the reasoning that connects those notes. ScopeThread is an agentic-memory application that preserves client evidence, current decisions, and the history behind every change.

### 0:18-0:38 — Initial memory

**On screen:** Show the active decision that online booking is not needed, including its fictional source quote.

**Narration:**

> This project currently has an active decision that online booking is not required. ScopeThread stores it as structured memory in CockroachDB, together with the exact source quote and rationale. It is more than transcript search because the record represents what is currently true.

### 0:38-1:04 — Live agent analysis

**On screen:** Submit the later conversation requesting a booking button on every page. Show the grounded conflict and the safe agent-run identifier.

**Narration:**

> A later client message requests a booking button on every page. The AWS Lambda workflow creates a multilingual embedding with Amazon Bedrock, retrieves related memory through CockroachDB vector search, and asks Amazon Nova to analyze the evidence. The agent reconnects this request with the earlier decision and flags a grounded conflict instead of silently replacing history.

### 1:04-1:25 — Confirm the revision

**On screen:** Confirm that the direction changed, enter the fictional reason, and submit. Show the prior decision as superseded and the replacement as active.

**Narration:**

> I confirm that the direction changed and provide the reason. In one controlled transaction, the prior decision becomes superseded, the replacement becomes active, and ScopeThread stores an explicit supersedes link. The old decision remains available as evidence rather than disappearing in an edit.

### 1:25-1:41 — Persistence and localization

**On screen:** Reload the page, show the same revision chain, switch to Japanese, and return to English.

**Narration:**

> After a full reload, the revision chain is still present because CockroachDB is the durable memory layer. The interface is English-first for reviewers and also supports natural Japanese without changing source quotes or project state.

### 1:41-2:01 — Managed MCP audit

**On screen:** Show [`assets/mcp-audit-evidence.svg`](./assets/mcp-audit-evidence.svg), which contains only the allowlisted read-only Managed MCP result for the successful public run. Highlight the run status, the two decision states, the revision link, and the vector index.

**Narration:**

> A separate read-only CockroachDB Cloud Managed MCP connection audits the same memory. This result shows the successful agent run, the superseded prior decision, the active replacement, and their revision link without exposing credentials or client text.

### 2:01-2:14 — Architecture and close

**On screen:** Show [`assets/architecture-overview.svg`](./assets/architecture-overview.svg), which summarizes the browser, AWS, Bedrock, CockroachDB, and read-only Managed MCP flow. End on the ScopeThread tagline.

**Narration:**

> ScopeThread combines AWS execution with CockroachDB relational and vector memory. It helps creators never lose the thread of client decisions.

## Final-take review

Reviewed on 2026-08-10 against the public YouTube upload and the local final export:

- [x] Duration is 2:14 and remains under 3:00.
- [x] The public demo visibly performs analysis, revision confirmation, reload persistence, and language switching rather than using static slides alone.
- [x] CockroachDB appears as the persistent memory layer, and the sanitized Managed MCP result is readable.
- [x] The prior decision changes from `active` to `superseded`, and the replacement becomes `active`.
- [x] No AWS account ID, CockroachDB cluster ID, OAuth token, database URL, bearer token, password, secret URL, or real client data appears in video or audio. The displayed UUID is the intentionally allowlisted agent-run identifier.
- [x] Narration matches the demonstrated behavior. Later label and layout clarifications do not change the recorded workflow or outcome.
- [x] The video is publicly available at [YouTube](https://www.youtube.com/watch?v=T7881nwgDD0).
- [x] The final 50-cue English caption track has no overlaps, ends at 2:11.057 within the 2:14 video, and was spot-checked across all seven scene segments after YouTube processing.

## Post-recording security cleanup

- [ ] Disconnect or revoke the Managed MCP OAuth session as required by `MCP_AUDIT_RUNBOOK.md` after submission evidence no longer needs the live connection.
