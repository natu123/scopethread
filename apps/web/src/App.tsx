import { useEffect, useState } from "react";
import {
  activeDecisionLabel,
  agentRunLabel,
  analysesLeftLabel,
  copy,
  defaultConversation,
  groundedRecordsLabel,
  localeNumber,
  memoryKindLabel,
  memoryStatusLabel,
  translateApiMessage,
  translateDemoText,
  translateKnownError,
  type Locale,
} from "./i18n.js";
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

type ConflictDismissalResponse = {
  mode: "conflict-dismissed";
  priorMemoryId: string;
  dismissedMemoryId: string;
  reason: string;
  dismissedAt: string;
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
const localeStorageKey = "scopethread.locale.v1";

function storedLocale(): Locale {
  try {
    const locale = localStorage.getItem(localeStorageKey);
    return locale === "ja" ? "ja" : "en";
  } catch {
    return "en";
  }
}

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
  locale: Locale,
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
        ? translateApiMessage(payload.message, locale)
        : copy[locale].memoryLoadFailed,
    );
  }
  return payload;
}

export function App() {
  const [locale, setLocale] = useState<Locale>(storedLocale);
  const t = copy[locale];
  const [session, setSession] = useState<DemoSession | null>(null);
  const [sessionStatus, setSessionStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [conversation, setConversation] = useState(defaultConversation.en);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [revisionReason, setRevisionReason] = useState("");
  const [revision, setRevision] = useState<RevisionResponse | null>(null);
  const [dismissal, setDismissal] =
    useState<ConflictDismissalResponse | null>(null);
  const [revisionStatus, setRevisionStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [revisionError, setRevisionError] = useState<string | null>(null);
  const [resolutionAction, setResolutionAction] = useState<
    "revision" | "dismissal" | null
  >(null);
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
    document.documentElement.lang = locale;
    try {
      localStorage.setItem(localeStorageKey, locale);
    } catch {
      // The language switch remains usable when storage is unavailable.
    }
  }, [locale]);

  function handleLocaleChange(nextLocale: Locale) {
    if (conversation === defaultConversation[locale]) {
      setConversation(defaultConversation[nextLocale]);
    }
    setSessionError((value) => translateKnownError(value, nextLocale));
    setError((value) => translateKnownError(value, nextLocale));
    setMemoryError((value) => translateKnownError(value, nextLocale));
    setRevisionError((value) => translateKnownError(value, nextLocale));
    setLocale(nextLocale);
  }

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
      setSessionError(t.apiNotConfigured);
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
              ? translateApiMessage(payload.message, locale)
              : t.sessionCreateFailed,
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
            : t.sessionCreateFailed,
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
    void requestProjectMemory(session, locale)
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
              : t.memoryLoadFailed,
          );
        }
      });
    return () => {
      active = false;
    };
  }, [locale, session, t.memoryLoadFailed]);

  async function refreshProjectMemory(activeSession: DemoSession) {
    try {
      const snapshot = await requestProjectMemory(activeSession, locale);
      setMemorySnapshot(snapshot);
      setMemoryStatus("ready");
      setMemoryError(null);
    } catch (caught) {
      setMemoryStatus("error");
      setMemoryError(
        caught instanceof Error
          ? caught.message
          : t.memoryRefreshFailed,
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
      setError(t.apiNotConfigured);
      return;
    }

    const idempotencyKey = crypto.randomUUID();
    setStatus("loading");
    setError(null);
    setRunId(null);
    setResult(null);
    setRevision(null);
    setDismissal(null);
    setRevisionReason("");
    setRevisionStatus("idle");
    setRevisionError(null);
    setResolutionAction(null);

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
          locale,
        }),
      });
      const payload = (await response.json()) as
        | AnalyzeResponse
        | AnalyzeErrorResponse;

      if (!response.ok || !("result" in payload)) {
        setRunId(payload.runId ?? null);
        throw new Error(
          "message" in payload && payload.message
            ? translateApiMessage(payload.message, locale)
            : t.analysisFailed,
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
          : t.analysisUnexpected,
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
    setResolutionAction("revision");
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
            ? translateApiMessage(payload.message, locale)
            : t.revisionSaveFailed,
        );
      }

      setRevision(payload);
      setRevisionStatus("success");
      setResolutionAction(null);
      await refreshProjectMemory(session);
    } catch (caught) {
      setRevisionStatus("error");
      setResolutionAction(null);
      setRevisionError(
        caught instanceof Error
          ? caught.message
          : t.revisionUnexpected,
      );
    }
  }

  async function handleDismissal() {
    const reason = revisionReason.trim();
    const conflict = result?.conflicts[0];
    if (
      reason.length < 3 ||
      !conflict ||
      !runId ||
      !session ||
      revisionStatus === "loading"
    ) {
      return;
    }

    setRevisionStatus("loading");
    setResolutionAction("dismissal");
    setRevisionError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/conflicts/dismiss`, {
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
        | ConflictDismissalResponse
        | AnalyzeErrorResponse;
      if (!response.ok || !("dismissedMemoryId" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? translateApiMessage(payload.message, locale)
            : t.dismissalFailed,
        );
      }

      setDismissal(payload);
      setRevisionStatus("success");
      setResolutionAction(null);
      await refreshProjectMemory(session);
    } catch (caught) {
      setRevisionStatus("error");
      setResolutionAction(null);
      setRevisionError(
        caught instanceof Error
          ? caught.message
          : t.dismissalUnexpected,
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
    t.loadingDecision;
  const hasStoredRevision = Boolean(
    latestRevisionLink && revisionPrior && revisionReplacement,
  );
  const latestDismissedMemory = memoryItems
    .filter(
      (item) =>
        item.status === "dismissed" &&
        memoryLinks.some(
          (link) =>
            link.relation === "conflicts_with" &&
            link.fromMemoryId === item.id,
        ),
    )
    .at(-1);
  const hasStoredDismissal = Boolean(latestDismissedMemory);
  const nextQuestion =
    conflict?.confirmationQuestion ?? result?.nextQuestions[0] ?? null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label={t.homeLabel}>
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>ScopeThread</span>
        </a>
        <div className="topbar-actions">
          <span className="environment-label">
            {sessionStatus === "ready"
              ? t.agenticMemory
              : sessionStatus === "loading"
                ? t.startingSession
                : t.sessionUnavailable}
          </span>
          <div className="language-switch" aria-label={t.languageSwitcherLabel}>
            <button
              type="button"
              className={locale === "en" ? "is-active" : ""}
              aria-pressed={locale === "en"}
              onClick={() => handleLocaleChange("en")}
            >
              EN
            </button>
            <button
              type="button"
              className={locale === "ja" ? "is-active" : ""}
              aria-pressed={locale === "ja"}
              onClick={() => handleLocaleChange("ja")}
            >
              日本語
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="workspace">
        <section className="intro" aria-labelledby="page-title">
          <p className="eyebrow">{t.introEyebrow}</p>
          <h1 id="page-title">{t.introTitle}</h1>
          <p>{t.introBody}</p>
        </section>

        <div className="project-grid">
          <aside className="panel memory-panel" aria-labelledby="memory-title">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{t.projectMemory}</p>
                <h2 id="memory-title">
                  {session
                    ? translateDemoText(session.projectName, locale)
                    : t.preparingMemory}
                </h2>
              </div>
              <span className="status-pill">
                {activeDecisionLabel(activeDecisionCount, locale)}
              </span>
            </div>

            {memoryItems.map((item) => (
              <article
                className={`memory-card${
                  item.status === "superseded"
                    ? " memory-card--superseded"
                    : item.status === "dismissed"
                      ? " memory-card--dismissed"
                    : item.status === "active" && item.id !== session?.initialDecision.id
                      ? " memory-card--replacement"
                      : ""
                }`}
                key={item.id}
              >
                <div className="memory-meta">
                  <span>{memoryKindLabel(item.kind, locale)}</span>
                  <span>{memoryStatusLabel(item.status, locale)}</span>
                </div>
                <p>{translateDemoText(item.content, locale)}</p>
                {item.rationale ? (
                  <small>
                    {t.reason}: {translateDemoText(item.rationale, locale)}
                  </small>
                ) : null}
                <small>
                  {t.source}: {translateDemoText(item.sourceQuote, locale)}
                </small>
              </article>
            ))}

            {memoryStatus === "loading" ? (
              <p className="memory-note">{t.refreshingMemory}</p>
            ) : null}
            {memoryError ? (
              <p className="form-error" role="alert">{memoryError}</p>
            ) : null}

            <dl className="project-facts">
              <div>
                <dt>{t.requirements}</dt>
                <dd>{requirementCount}</dd>
              </div>
              <div>
                <dt>{t.openQuestions}</dt>
                <dd>{openQuestionCount}</dd>
              </div>
              <div>
                <dt>{t.revisions}</dt>
                <dd>{revisionCount}</dd>
              </div>
            </dl>
          </aside>

          <section className="panel conversation-panel" aria-labelledby="conversation-title">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{t.newEvidence}</p>
                <h2 id="conversation-title">{t.analyzeConversation}</h2>
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <label htmlFor="conversation">{t.clientConversation}</label>
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
                  {localeNumber(conversation.length, locale)} / 8,000
                  {remainingAnalysisRequests === null
                    ? ""
                    : ` · ${analysesLeftLabel(remainingAnalysisRequests, locale)}`}
                </small>
                <button
                  type="submit"
                  disabled={status === "loading" || sessionStatus !== "ready"}
                >
                  {status === "loading" ? t.analyzing : t.analyzeMemory}
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
            data-conflict={Boolean(conflict && !revision && !dismissal)}
          >
            {revision
              ? t.revisionConfirmed
              : dismissal
                ? t.conflictDismissed
              : hasStoredRevision && !result
                ? t.storedRevision
                : hasStoredDismissal && !result
                  ? t.storedDismissal
              : status === "loading"
              ? t.analyzingStatus
              : conflict
                ? t.conflictFound
                : result
                  ? t.noConflictFound
                  : t.awaitingAnalysis}
          </div>
          <div>
            <p className="eyebrow">{t.agentAnalysis}</p>
            <h2 id="result-title">
              {result?.summary ??
                (hasStoredRevision
                  ? t.storedRevisionSummary
                  : hasStoredDismissal
                    ? t.storedDismissalSummary
                  : t.emptyAnalysisSummary)}
            </h2>
            <p className="evidence-link">
              {result?.retrievedEvidenceIds.length
                ? groundedRecordsLabel(result.retrievedEvidenceIds.length, locale)
                : hasStoredRevision
                  ? t.loadedRevisionEvidence
                  : hasStoredDismissal
                    ? t.loadedDismissalEvidence
                  : t.noEvidence}
            </p>
          </div>
          <div className="question-card">
            <span>
              {dismissal
                ? t.dismissalReason
                : hasStoredDismissal && !result
                  ? t.dismissalReason
                : revision || (hasStoredRevision && !result)
                ? t.decisionRevision
                : t.nextQuestion}
            </span>
            <p>
              {dismissal
                ? dismissal.reason
                : hasStoredDismissal && !result
                  ? latestDismissedMemory?.rationale ??
                    t.noDismissalReason
                : revision
                ? revision.reason
                : hasStoredRevision && !result
                  ? latestRevisionLink?.reason ?? t.noRevisionReason
                : nextQuestion ?? t.emptyNextQuestion}
            </p>
          </div>
          {conflict && runId && !revision && !dismissal ? (
            <form className="revision-form" onSubmit={handleRevisionSubmit}>
              <div>
                <label htmlFor="revision-reason">{t.decisionReason}</label>
                <textarea
                  id="revision-reason"
                  value={revisionReason}
                  onChange={(event) => setRevisionReason(event.target.value)}
                  rows={3}
                  maxLength={2000}
                  disabled={revisionStatus === "loading"}
                  placeholder={t.reasonPlaceholder}
                />
              </div>
              <div className="revision-actions">
                <small>{localeNumber(revisionReason.length, locale)} / 2,000</small>
                <button
                  type="submit"
                  disabled={
                    revisionStatus === "loading" ||
                    revisionReason.trim().length < 3
                  }
                >
                  {resolutionAction === "revision"
                    ? t.savingRevision
                    : t.confirmRevision}
                </button>
                <button
                  className="button-secondary"
                  type="button"
                  onClick={() => void handleDismissal()}
                  disabled={
                    revisionStatus === "loading" ||
                    revisionReason.trim().length < 3
                  }
                >
                  {resolutionAction === "dismissal"
                    ? t.dismissingConflict
                    : t.dismissConflict}
                </button>
              </div>
              {revisionError ? (
                <p className="form-error" role="alert">{revisionError}</p>
              ) : null}
            </form>
          ) : null}
          {(revision && conflict) || hasStoredRevision ? (
            <div className="revision-chain" aria-label={t.decisionRevision}>
              <span>{t.supersededDecision}</span>
              <p>{translateDemoText(originalDecision, locale)}</p>
              <span aria-hidden="true">↓</span>
              <span>{t.activeReplacement}</span>
              <p>
                {translateDemoText(
                  revisionReplacement?.content ?? conflict?.newStatement ?? "",
                  locale,
                )}
              </p>
            </div>
          ) : null}
          <p className="preview-note">
            {runId
              ? agentRunLabel(runId, locale)
              : t.successfulAnalysisNote}
          </p>
        </section>
      </main>
    </div>
  );
}
