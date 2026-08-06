import { useEffect, useState } from "react";

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
  remainingAnalysisRequests: number;
  result: AnalysisResult;
};

type AnalyzeErrorResponse = {
  message?: string;
  runId?: string;
};

type RevisionResponse = {
  mode: "revision-confirmed";
  priorMemoryId: string;
  replacementMemoryId: string;
  reason: string;
  revisedAt: string;
  changed: boolean;
};

type DemoSession = {
  token: string;
  sessionId: string;
  projectId: string;
  projectName: string;
  initialDecision: {
    id: string;
    content: string;
    rationale: string | null;
    sourceQuote: string;
  };
  expiresAt: string;
  maxAnalysisRequests: number;
};

const sessionStorageKey = "scopethread.demo-session.v1";

function storedSession(): DemoSession | null {
  try {
    const raw = sessionStorage.getItem(sessionStorageKey);
    if (!raw) {
      return null;
    }
    const candidate = JSON.parse(raw) as Partial<DemoSession>;
    if (
      typeof candidate.token !== "string" ||
      typeof candidate.projectId !== "string" ||
      typeof candidate.projectName !== "string" ||
      typeof candidate.expiresAt !== "string" ||
      typeof candidate.initialDecision?.id !== "string" ||
      typeof candidate.initialDecision.content !== "string" ||
      new Date(candidate.expiresAt).getTime() <= Date.now()
    ) {
      sessionStorage.removeItem(sessionStorageKey);
      return null;
    }
    return candidate as DemoSession;
  } catch {
    sessionStorage.removeItem(sessionStorageKey);
    return null;
  }
}

export function App() {
  const [session, setSession] = useState<DemoSession | null>(null);
  const [sessionStatus, setSessionStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [conversation, setConversation] = useState(defaultConversation);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [revisionReason, setRevisionReason] = useState("");
  const [revision, setRevision] = useState<RevisionResponse | null>(null);
  const [revisionStatus, setRevisionStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [revisionError, setRevisionError] = useState<string | null>(null);
  const [remainingAnalysisRequests, setRemainingAnalysisRequests] = useState<
    number | null
  >(null);

  useEffect(() => {
    const existing = storedSession();
    if (existing) {
      setSession(existing);
      setRemainingAnalysisRequests(null);
      setSessionStatus("ready");
      return;
    }
    if (!apiBaseUrl) {
      setSessionStatus("error");
      setSessionError("VITE_API_BASE_URL is not configured for this build.");
      return;
    }

    const controller = new AbortController();
    void fetch(`${apiBaseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as DemoSession | AnalyzeErrorResponse;
        if (!response.ok || !("token" in payload)) {
          throw new Error(
            "message" in payload && payload.message
              ? payload.message
              : "A demo session could not be created.",
          );
        }
        sessionStorage.setItem(sessionStorageKey, JSON.stringify(payload));
        setSession(payload);
        setRemainingAnalysisRequests(payload.maxAnalysisRequests);
        setSessionStatus("ready");
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }
        setSessionStatus("error");
        setSessionError(
          caught instanceof Error
            ? caught.message
            : "A demo session could not be created.",
        );
      });

    return () => controller.abort();
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = conversation.trim();
    if (!trimmed || status === "loading" || !session) {
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
    setRevision(null);
    setRevisionReason("");
    setRevisionStatus("idle");
    setRevisionError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/analyze`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-idempotency-key": idempotencyKey,
          authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          projectId: session.projectId,
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
      setRemainingAnalysisRequests(payload.remainingAnalysisRequests);
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

  async function handleRevisionSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const reason = revisionReason.trim();
    const conflict = result?.conflicts[0];
    if (
      !reason ||
      !conflict ||
      !runId ||
      !session ||
      revisionStatus === "loading"
    ) {
      return;
    }

    setRevisionStatus("loading");
    setRevisionError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/revisions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          projectId: session.projectId,
          agentRunId: runId,
          priorMemoryId: conflict.priorMemoryId,
          reason,
        }),
      });
      const payload = (await response.json()) as
        | RevisionResponse
        | AnalyzeErrorResponse;

      if (!response.ok || !("replacementMemoryId" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The decision revision could not be saved.",
        );
      }

      setRevision(payload);
      setRevisionStatus("success");
    } catch (caught) {
      setRevisionStatus("error");
      setRevisionError(
        caught instanceof Error
          ? caught.message
          : "The decision revision failed unexpectedly.",
      );
    }
  }

  const conflict = result?.conflicts[0];
  const originalDecision =
    session?.initialDecision.content ?? "Loading the demo decision...";
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
          {sessionStatus === "ready"
            ? "Agentic memory"
            : sessionStatus === "loading"
              ? "Starting session"
              : "Session unavailable"}
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
                <h2 id="memory-title">
                  {session?.projectName ?? "Preparing project memory"}
                </h2>
              </div>
              <span className="status-pill">1 active decision</span>
            </div>

            <article
              className={`memory-card${revision ? " memory-card--superseded" : ""}`}
            >
              <div className="memory-meta">
                <span>Decision</span>
                <span>{revision ? "Superseded" : "Active"}</span>
              </div>
              <p>{originalDecision}</p>
              <small>
                Source: {session?.initialDecision.sourceQuote ?? "Loading evidence..."}
              </small>
            </article>

            {revision && conflict ? (
              <article className="memory-card memory-card--replacement">
                <div className="memory-meta">
                  <span>Decision</span>
                  <span>Active</span>
                </div>
                <p>{conflict.newStatement}</p>
                <small>Reason: {revision.reason}</small>
              </article>
            ) : null}

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
                <dd>{revision ? 1 : 0}</dd>
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
                disabled={status === "loading" || sessionStatus !== "ready"}
              />
              <div className="form-footer">
                <small>
                  {conversation.length.toLocaleString()} / 8,000
                  {remainingAnalysisRequests === null
                    ? ""
                    : ` · ${remainingAnalysisRequests} analyses left`}
                </small>
                <button
                  type="submit"
                  disabled={status === "loading" || sessionStatus !== "ready"}
                >
                  {status === "loading" ? "Analyzing..." : "Analyze memory"}
                </button>
              </div>
              {error ? <p className="form-error" role="alert">{error}</p> : null}
              {sessionError ? (
                <p className="form-error" role="alert">{sessionError}</p>
              ) : null}
            </form>
          </section>
        </div>

        <section className="panel result-panel" aria-labelledby="result-title">
          <div
            className="result-status"
            data-conflict={Boolean(conflict && !revision)}
          >
            {revision
              ? "Revision confirmed"
              : status === "loading"
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
            <span>{revision ? "Decision revision" : "Next question"}</span>
            <p>
              {revision
                ? revision.reason
                : nextQuestion ?? "The next grounded question will appear here."}
            </p>
          </div>
          {conflict && runId && !revision ? (
            <form className="revision-form" onSubmit={handleRevisionSubmit}>
              <div>
                <label htmlFor="revision-reason">Reason for changing direction</label>
                <textarea
                  id="revision-reason"
                  value={revisionReason}
                  onChange={(event) => setRevisionReason(event.target.value)}
                  rows={3}
                  maxLength={2000}
                  disabled={revisionStatus === "loading"}
                  placeholder="Record why the earlier decision should be superseded."
                />
              </div>
              <div className="revision-actions">
                <small>{revisionReason.length.toLocaleString()} / 2,000</small>
                <button
                  type="submit"
                  disabled={
                    revisionStatus === "loading" ||
                    revisionReason.trim().length < 3
                  }
                >
                  {revisionStatus === "loading"
                    ? "Saving revision..."
                    : "Confirm revision"}
                </button>
              </div>
              {revisionError ? (
                <p className="form-error" role="alert">{revisionError}</p>
              ) : null}
            </form>
          ) : null}
          {revision && conflict ? (
            <div className="revision-chain" aria-label="Decision revision chain">
              <span>Superseded decision</span>
              <p>{originalDecision}</p>
              <span aria-hidden="true">↓</span>
              <span>Active replacement</span>
              <p>{conflict.newStatement}</p>
            </div>
          ) : null}
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
