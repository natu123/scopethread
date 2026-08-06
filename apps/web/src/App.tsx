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

type ProjectMemoryItem = {
  id: string;
  projectId: string;
  sourceConversationId: string;
  kind: "requirement" | "decision" | "rationale" | "open_question";
  status: "proposed" | "active" | "superseded" | "resolved" | "dismissed";
  content: string;
  rationale: string | null;
  sourceQuote: string;
  createdAt: string;
};

type ProjectMemoryLink = {
  id: string;
  fromMemoryId: string;
  toMemoryId: string;
  relation: "supersedes" | "supports" | "conflicts_with";
  reason: string | null;
  createdAt: string;
};

type ProjectMemorySnapshot = {
  mode: "project-memory";
  projectId: string;
  projectName: string;
  items: ProjectMemoryItem[];
  links: ProjectMemoryLink[];
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

async function requestProjectMemory(
  activeSession: DemoSession,
): Promise<ProjectMemorySnapshot> {
  const response = await fetch(
    `${apiBaseUrl}/memory?projectId=${encodeURIComponent(activeSession.projectId)}`,
    {
      headers: { authorization: `Bearer ${activeSession.token}` },
    },
  );
  const payload = (await response.json()) as
    | ProjectMemorySnapshot
    | AnalyzeErrorResponse;
  if (!response.ok || !("items" in payload)) {
    throw new Error(
      "message" in payload && payload.message
        ? payload.message
        : "Project memory could not be loaded.",
    );
  }
  return payload;
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
  const [memorySnapshot, setMemorySnapshot] =
    useState<ProjectMemorySnapshot | null>(null);
  const [memoryStatus, setMemoryStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [memoryError, setMemoryError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!session) {
      return;
    }
    let active = true;
    setMemoryStatus("loading");
    setMemoryError(null);
    void requestProjectMemory(session)
      .then((snapshot) => {
        if (active) {
          setMemorySnapshot(snapshot);
          setMemoryStatus("ready");
        }
      })
      .catch((caught) => {
        if (active) {
          setMemoryStatus("error");
          setMemoryError(
            caught instanceof Error
              ? caught.message
              : "Project memory could not be loaded.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [session]);

  async function refreshProjectMemory(activeSession: DemoSession) {
    try {
      const snapshot = await requestProjectMemory(activeSession);
      setMemorySnapshot(snapshot);
      setMemoryStatus("ready");
      setMemoryError(null);
    } catch (caught) {
      setMemoryStatus("error");
      setMemoryError(
        caught instanceof Error
          ? caught.message
          : "Project memory could not be refreshed.",
      );
    }
  }

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
      await refreshProjectMemory(session);
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
      await refreshProjectMemory(session);
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
  const bootstrapMemory: ProjectMemoryItem[] = session
    ? [
        {
          id: session.initialDecision.id,
          projectId: session.projectId,
          sourceConversationId: "bootstrap",
          kind: "decision",
          status: "active",
          content: session.initialDecision.content,
          rationale: session.initialDecision.rationale,
          sourceQuote: session.initialDecision.sourceQuote,
          createdAt: session.expiresAt,
        },
      ]
    : [];
  const memoryItems = memorySnapshot?.items ?? bootstrapMemory;
  const memoryLinks = memorySnapshot?.links ?? [];
  const activeDecisionCount = memoryItems.filter(
    (item) => item.kind === "decision" && item.status === "active",
  ).length;
  const requirementCount = memoryItems.filter(
    (item) => item.kind === "requirement" && item.status !== "dismissed",
  ).length;
  const openQuestionCount = memoryItems.filter(
    (item) => item.kind === "open_question" && item.status !== "resolved",
  ).length;
  const revisionCount = memoryLinks.filter(
    (link) => link.relation === "supersedes",
  ).length;
  const latestRevisionLink = memoryLinks
    .filter((link) => link.relation === "supersedes")
    .at(-1);
  const revisionPrior = memoryItems.find(
    (item) => item.id === latestRevisionLink?.toMemoryId,
  );
  const revisionReplacement = memoryItems.find(
    (item) => item.id === latestRevisionLink?.fromMemoryId,
  );
  const originalDecision =
    revisionPrior?.content ??
    session?.initialDecision.content ??
    "Loading the demo decision...";
  const hasStoredRevision = Boolean(
    latestRevisionLink && revisionPrior && revisionReplacement,
  );
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
              <span className="status-pill">
                {activeDecisionCount} active decision
                {activeDecisionCount === 1 ? "" : "s"}
              </span>
            </div>

            {memoryItems.map((item) => (
              <article
                className={`memory-card${
                  item.status === "superseded"
                    ? " memory-card--superseded"
                    : item.status === "active" && item.id !== session?.initialDecision.id
                      ? " memory-card--replacement"
                      : ""
                }`}
                key={item.id}
              >
                <div className="memory-meta">
                  <span>{item.kind.replace("_", " ")}</span>
                  <span>{item.status}</span>
                </div>
                <p>{item.content}</p>
                {item.rationale ? <small>Reason: {item.rationale}</small> : null}
                <small>Source: {item.sourceQuote}</small>
              </article>
            ))}

            {memoryStatus === "loading" ? (
              <p className="memory-note">Refreshing CockroachDB memory...</p>
            ) : null}
            {memoryError ? (
              <p className="form-error" role="alert">{memoryError}</p>
            ) : null}

            <dl className="project-facts">
              <div>
                <dt>Requirements</dt>
                <dd>{requirementCount}</dd>
              </div>
              <div>
                <dt>Open questions</dt>
                <dd>{openQuestionCount}</dd>
              </div>
              <div>
                <dt>Revisions</dt>
                <dd>{revisionCount}</dd>
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
              : hasStoredRevision && !result
                ? "Stored revision"
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
              {result?.summary ??
                (hasStoredRevision
                  ? "The current decision supersedes an earlier client choice."
                  : "Submit new client evidence to search project memory.")}
            </h2>
            <p className="evidence-link">
              {result?.retrievedEvidenceIds.length
                ? `Grounded in ${result.retrievedEvidenceIds.length} stored memory record(s).`
                : hasStoredRevision
                  ? "Loaded from persisted CockroachDB revision history."
                  : "No stored evidence has been retrieved yet."}
            </p>
          </div>
          <div className="question-card">
            <span>
              {revision || (hasStoredRevision && !result)
                ? "Decision revision"
                : "Next question"}
            </span>
            <p>
              {revision
                ? revision.reason
                : hasStoredRevision && !result
                  ? latestRevisionLink?.reason ?? "No revision reason was recorded."
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
          {(revision && conflict) || hasStoredRevision ? (
            <div className="revision-chain" aria-label="Decision revision chain">
              <span>Superseded decision</span>
              <p>{originalDecision}</p>
              <span aria-hidden="true">↓</span>
              <span>Active replacement</span>
              <p>{revisionReplacement?.content ?? conflict?.newStatement}</p>
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
