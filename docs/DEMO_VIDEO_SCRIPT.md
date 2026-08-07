# ScopeThread Demo Video Script

Target duration: 2 minutes 40 seconds. The final upload must be public on YouTube or Vimeo and remain under three minutes.

## Recording gate

The Managed MCP gate was satisfied on 2026-08-07: the allowlisted audit in `MCP_AUDIT_RUNBOOK.md` returned the successful public run, its revision chain, and the vector index through the single-cluster read-only connection. Use only fictional client content. Keep browser developer tools, address-bar query strings, AWS account details, CockroachDB cluster details, terminal environment variables, and authentication screens out of frame.

Do not reuse the pre-audit diagnostic capture because one tool output displayed the cluster ID. Use only the final allowlisted query results, cropped to the documented columns. The diagnostic contained no credential or OAuth token, but it is not approved recording material.

## Capture setup

- Use a 1920 x 1080 canvas and record the browser content area at 100% zoom.
- In OBS Studio, use a 1920 x 1080 base and output canvas at 30 frames per second.
- Record to MKV so an interrupted take remains recoverable, then use OBS **File > Remux Recordings** to create the upload-ready MP4.
- Use application-window capture sources rather than full-display capture. This keeps unrelated tabs, notifications, account details, and the pre-audit diagnostic output outside the recording surface.
- Prepare three scenes before recording: **Public demo**, **Managed MCP evidence**, and **Architecture close**.
- Disable desktop audio unless the demo intentionally uses it. Record the narration microphone on its own audio source and make a ten-second level test before the final take.
- Use the English interface for the main workflow, then show the Japanese switch briefly.
- Prepare the public demo, the read-only MCP result, and one architecture image or document before recording.
- Reset the demo to the known fictional booking scenario before the take.
- Crop the MCP result to the allowlisted columns documented in `MCP_AUDIT_RUNBOOK.md`.
- For the MCP scene, show the succeeded run, `superseded` and `active` decision states, the `supersedes` relation, and `memory_items_embedding_idx`; do not show configuration or discovery output.
- Do not display account IDs, cluster IDs, database URLs, OAuth screens, bearer tokens, passwords, request headers, or real client data.

## Timed storyboard and narration

### 0:00-0:20 — Problem and product

**On screen:** Open the ScopeThread landing page and move directly to the demo workspace.

**Narration:**

> Website projects rarely lose requirements because nobody took notes. They lose the reasoning that connects those notes. ScopeThread is an agentic-memory application that preserves client evidence, current decisions, and the history behind every change.

### 0:20-0:40 — Initial memory

**On screen:** Show the active decision that online booking is not needed, including its fictional source quote.

**Narration:**

> This project currently has an active decision that online booking is not required. ScopeThread stores it as structured memory in CockroachDB, together with the exact source quote and rationale. It is more than transcript search because the record represents what is currently true.

### 0:40-1:15 — Live agent analysis

**On screen:** Submit the later conversation requesting a booking button on every page. Show the grounded conflict and the safe agent-run identifier.

**Narration:**

> A later client message requests a booking button on every page. The AWS Lambda workflow creates a multilingual embedding with Amazon Bedrock, retrieves related memory through CockroachDB vector search, and asks Amazon Nova to analyze the evidence. The agent reconnects this request with the earlier decision and flags a grounded conflict instead of silently replacing history.

### 1:15-1:45 — Confirm the revision

**On screen:** Confirm that the direction changed, enter the fictional reason, and submit. Show the prior decision as superseded and the replacement as active.

**Narration:**

> I confirm that the direction changed and provide the reason. In one controlled transaction, the prior decision becomes superseded, the replacement becomes active, and ScopeThread stores an explicit supersedes link. The old decision remains available as evidence rather than disappearing in an edit.

### 1:45-2:05 — Persistence and localization

**On screen:** Reload the page, show the same revision chain, switch to Japanese, and return to English.

**Narration:**

> After a full reload, the revision chain is still present because CockroachDB is the durable memory layer. The interface is English-first for reviewers and also supports natural Japanese without changing source quotes or project state.

### 2:05-2:25 — Managed MCP audit

**On screen:** Show only the allowlisted read-only Managed MCP result for the successful public run, then highlight the run status and the two decision states.

**Narration:**

> A separate read-only CockroachDB Cloud Managed MCP connection audits the same memory. This result shows the successful agent run, the superseded prior decision, the active replacement, and their revision link without exposing credentials or client text.

### 2:25-2:40 — Architecture and close

**On screen:** Show [`assets/architecture-overview.svg`](./assets/architecture-overview.svg), which summarizes the browser, AWS, Bedrock, CockroachDB, and read-only Managed MCP flow. End on the ScopeThread tagline.

**Narration:**

> ScopeThread combines AWS execution with CockroachDB relational and vector memory. It helps creators never lose the thread of client decisions.

## Final-take review

- Confirm the duration is less than 3:00.
- Confirm the public demo is visibly functioning rather than represented by static slides alone.
- Confirm CockroachDB appears as the persistent memory layer and the Managed MCP result is readable.
- Confirm the revision changes from `active` to `superseded` and the replacement becomes `active`.
- Confirm no identifiers, credentials, tokens, URLs with secrets, or real client data appear in video or audio.
- Confirm narration matches the behavior visible in the final deployed application.
- Upload publicly to YouTube or Vimeo, test the URL in a signed-out window, and replace `[VIDEO_DEMO_URL]` in `DEVPOST_DRAFT.md`.
- After the approved recording is complete, disconnect or revoke the Managed MCP OAuth session as required by `MCP_AUDIT_RUNBOOK.md`.
