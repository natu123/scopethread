import { useState } from "react";

const projectId = "10000000-0000-4000-8000-000000000002";
const originalDecision = "Do not include online booking in the launch scope.";
const defaultConversation =
  "The client would now like a booking button on every page so visitors can request an appointment.";
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

type Conflict = {
  priorMemoryId: string;
  newStatement: string;
  explanation: string;
  confirmationQuestion: string;
};

type AnalysisResult = {
  summary: string;
  conflicts: Conflict[];
  nextQuestions: string[];
  retrievedEvidenceIds: string[];
};

type AnalyzeResponse = {
  mode: string;
  runId: string;
  persisted: boolean;
  result: AnalysisResult;
};

type AnalyzeErrorResponse = {
  message?: string;
  runId?: string;
};

export function App() {
  const [conversation, setConversation] = useState(defaultConversation);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = conversation.trim();
    if (!trimmed || status === "loading") {
      return;
    }
    if (!apiBaseUrl) {
      setStatus("error");
      setError("VITE_API_BASE_URL is not configured for this build.");
      return;
    }

    const idempotencyKey = crypto.randomUUID();
    setStatus("loading");
    setError(null);
    setRunId(null);
    setResult(null);

    try {
      const response = await fetch(`${apiBaseUrl}/analyze`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          projectId,
          conversationText: trimmed,
          idempotencyKey,
        }),
      });
      const payload = (await response.json()) as
        | AnalyzeResponse
        | AnalyzeErrorResponse;

      if (!response.ok || !("result" in payload)) {
        setRunId(payload.runId ?? null);
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The agent request failed.",
        );
      }

      setResult(payload.result);
      setRunId(payload.runId);
      setStatus("success");
    } catch (caught) {
      setStatus("error");
      setError(
        caught instanceof Error
          ? caught.message
          : "The agent request failed unexpectedly.",
      );
    }
  }

  const conflict = result?.conflicts[0];
  const nextQuestion =
    conflict?.confirmationQuestion ?? result?.nextQuestions[0] ?? null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="ScopeThread home">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>ScopeThread</span>
        </a>
        <span className="environment-label">
          {apiBaseUrl ? "Agentic memory" : "API setup required"}
        </span>
      </header>

      <main id="top" className="workspace">
        <section className="intro" aria-labelledby="page-title">
          <p className="eyebrow">Website requirements memory</p>
          <h1 id="page-title">Keep every client decision connected.</h1>
          <p>
            ScopeThread turns conversations into traceable requirements, decisions,
            revisions, and next questions.
          </p>
        </section>

        <div className="project-grid">
          <aside className="panel memory-panel" aria-labelledby="memory-title">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Project memory</p>
                <h2 id="memory-title">Aozora Dental Clinic</h2>
              </div>
              <span className="status-pill">1 active decision</span>
            </div>

            <article className="memory-card">
              <div className="memory-meta">
                <span>Decision</span>
                <span>Active</span>
              </div>
              <p>{originalDecision}</p>
              <small>Source: Initial requirements conversation</small>
            </article>

            <dl className="project-facts">
              <div>
                <dt>Requirements</dt>
                <dd>0</dd>
              </div>
              <div>
                <dt>Open questions</dt>
                <dd>0</dd>
              </div>
              <div>
                <dt>Revisions</dt>
                <dd>0</dd>
              </div>
            </dl>
          </aside>

          <section className="panel conversation-panel" aria-labelledby="conversation-title">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">New evidence</p>
                <h2 id="conversation-title">Analyze a conversation</h2>
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <label htmlFor="conversation">Client conversation</label>
              <textarea
                id="conversation"
                value={conversation}
                onChange={(event) => setConversation(event.target.value)}
                rows={8}
                maxLength={8000}
                disabled={status === "loading"}
              />
              <div className="form-footer">
                <small>{conversation.length.toLocaleString()} / 8,000</small>
                <button type="submit" disabled={status === "loading"}>
                  {status === "loading" ? "Analyzing..." : "Analyze memory"}
                </button>
              </div>
              {error ? <p className="form-error" role="alert">{error}</p> : null}
            </form>
          </section>
        </div>

        <section className="panel result-panel" aria-labelledby="result-title">
          <div className="result-status" data-conflict={Boolean(conflict)}>
            {status === "loading"
              ? "Analyzing"
              : conflict
                ? "Conflict found"
                : result
                  ? "No conflict found"
                  : "Awaiting analysis"}
          </div>
          <div>
            <p className="eyebrow">Agent analysis</p>
            <h2 id="result-title">
              {result?.summary ?? "Submit new client evidence to search project memory."}
            </h2>
            <p className="evidence-link">
              {result?.retrievedEvidenceIds.length
                ? `Grounded in ${result.retrievedEvidenceIds.length} stored memory record(s).`
                : "No stored evidence has been retrieved yet."}
            </p>
          </div>
          <div className="question-card">
            <span>Next question</span>
            <p>{nextQuestion ?? "The next grounded question will appear here."}</p>
          </div>
          <p className="preview-note">
            {runId
              ? `Agent run: ${runId}`
              : "Successful analyses use Amazon Bedrock and persist traceable memory in CockroachDB."}
          </p>
        </section>
      </main>
    </div>
  );
}
