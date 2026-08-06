export type Locale = "en" | "ja";

export const defaultConversation: Record<Locale, string> = {
  en: "The client would now like a booking button on every page so visitors can request an appointment.",
  ja: "顧客は、訪問者が予約を申し込めるように、すべてのページへ予約ボタンを追加したいと希望しています。",
};

export const copy = {
  en: {
    languageName: "English",
    otherLanguageName: "日本語",
    languageSwitcherLabel: "Language",
    homeLabel: "ScopeThread home",
    agenticMemory: "Agentic memory",
    startingSession: "Starting session",
    sessionUnavailable: "Session unavailable",
    introEyebrow: "Website requirements memory",
    introTitle: "Keep every client decision connected.",
    introBody:
      "ScopeThread turns conversations into traceable requirements, decisions, revisions, and next questions.",
    projectMemory: "Project memory",
    preparingMemory: "Preparing project memory",
    reason: "Reason",
    source: "Source",
    refreshingMemory: "Refreshing CockroachDB memory...",
    requirements: "Requirements",
    openQuestions: "Open questions",
    revisions: "Revisions",
    newEvidence: "New evidence",
    analyzeConversation: "Analyze a conversation",
    clientConversation: "Client conversation",
    analyzing: "Analyzing...",
    analyzeMemory: "Analyze memory",
    revisionConfirmed: "Revision confirmed",
    conflictDismissed: "Conflict dismissed",
    storedRevision: "Stored revision",
    storedDismissal: "Stored dismissal",
    analyzingStatus: "Analyzing",
    conflictFound: "Conflict found",
    noConflictFound: "No conflict found",
    awaitingAnalysis: "Awaiting analysis",
    agentAnalysis: "Agent analysis",
    storedRevisionSummary:
      "The current decision supersedes an earlier client choice.",
    storedDismissalSummary:
      "A proposed conflict was dismissed without changing the active decision.",
    emptyAnalysisSummary:
      "Submit new client evidence to search project memory.",
    loadedRevisionEvidence:
      "Loaded from persisted CockroachDB revision history.",
    loadedDismissalEvidence:
      "Loaded from persisted CockroachDB conflict history.",
    noEvidence: "No stored evidence has been retrieved yet.",
    dismissalReason: "Dismissal reason",
    decisionRevision: "Decision revision",
    nextQuestion: "Next question",
    noDismissalReason: "No dismissal reason was recorded.",
    noRevisionReason: "No revision reason was recorded.",
    emptyNextQuestion: "The next grounded question will appear here.",
    decisionReason: "Reason for this decision",
    reasonPlaceholder:
      "Record why the conflict should be confirmed or dismissed.",
    savingRevision: "Saving revision...",
    confirmRevision: "Confirm revision",
    dismissingConflict: "Dismissing conflict...",
    dismissConflict: "Dismiss conflict",
    supersededDecision: "Superseded decision",
    activeReplacement: "Active replacement",
    successfulAnalysisNote:
      "Successful analyses use Amazon Bedrock and persist traceable memory in CockroachDB.",
    apiNotConfigured: "VITE_API_BASE_URL is not configured for this build.",
    sessionCreateFailed: "A demo session could not be created.",
    memoryLoadFailed: "Project memory could not be loaded.",
    memoryRefreshFailed: "Project memory could not be refreshed.",
    analysisFailed: "The agent request failed.",
    analysisUnexpected: "The agent request failed unexpectedly.",
    revisionSaveFailed: "The decision revision could not be saved.",
    revisionUnexpected: "The decision revision failed unexpectedly.",
    dismissalFailed: "The conflict could not be dismissed.",
    dismissalUnexpected: "The conflict dismissal failed unexpectedly.",
    loadingDecision: "Loading the demo decision...",
  },
  ja: {
    languageName: "日本語",
    otherLanguageName: "English",
    languageSwitcherLabel: "言語",
    homeLabel: "ScopeThread ホーム",
    agenticMemory: "エージェント記憶",
    startingSession: "セッションを開始しています",
    sessionUnavailable: "セッションを利用できません",
    introEyebrow: "Webサイト要件の記憶",
    introTitle: "顧客との意思決定を、すべてつなげて残す。",
    introBody:
      "ScopeThreadは、会話を追跡可能な要件、決定、修正履歴、次の質問へ変換します。",
    projectMemory: "プロジェクト記憶",
    preparingMemory: "プロジェクト記憶を準備しています",
    reason: "理由",
    source: "原文",
    refreshingMemory: "CockroachDBの記憶を更新しています...",
    requirements: "要件",
    openQuestions: "未決事項",
    revisions: "修正履歴",
    newEvidence: "新しい会話",
    analyzeConversation: "会話を分析する",
    clientConversation: "顧客との会話",
    analyzing: "分析しています...",
    analyzeMemory: "記憶を分析",
    revisionConfirmed: "修正を確定しました",
    conflictDismissed: "矛盾を却下しました",
    storedRevision: "保存済みの修正",
    storedDismissal: "保存済みの却下",
    analyzingStatus: "分析中",
    conflictFound: "矛盾を検出しました",
    noConflictFound: "矛盾は見つかりませんでした",
    awaitingAnalysis: "分析待ち",
    agentAnalysis: "エージェント分析",
    storedRevisionSummary: "現在の決定が、以前の顧客判断を更新しています。",
    storedDismissalSummary:
      "提案された矛盾は、現在の決定を変更せずに却下されています。",
    emptyAnalysisSummary:
      "新しい顧客との会話を入力すると、プロジェクト記憶を検索します。",
    loadedRevisionEvidence:
      "CockroachDBに保存された修正履歴を読み込みました。",
    loadedDismissalEvidence:
      "CockroachDBに保存された矛盾の履歴を読み込みました。",
    noEvidence: "保存済みの根拠は、まだ取得されていません。",
    dismissalReason: "却下理由",
    decisionRevision: "決定の修正",
    nextQuestion: "次に確認する質問",
    noDismissalReason: "却下理由は記録されていません。",
    noRevisionReason: "修正理由は記録されていません。",
    emptyNextQuestion: "根拠に基づく次の質問が、ここに表示されます。",
    decisionReason: "この判断の理由",
    reasonPlaceholder: "矛盾を確定または却下する理由を記録してください。",
    savingRevision: "修正を保存しています...",
    confirmRevision: "修正を確定",
    dismissingConflict: "矛盾を却下しています...",
    dismissConflict: "矛盾を却下",
    supersededDecision: "以前の決定",
    activeReplacement: "現在の決定",
    successfulAnalysisNote:
      "分析が成功すると、Amazon Bedrockを使用し、追跡可能な記憶をCockroachDBへ保存します。",
    apiNotConfigured: "このビルドにはVITE_API_BASE_URLが設定されていません。",
    sessionCreateFailed: "デモセッションを作成できませんでした。",
    memoryLoadFailed: "プロジェクト記憶を読み込めませんでした。",
    memoryRefreshFailed: "プロジェクト記憶を更新できませんでした。",
    analysisFailed: "エージェント分析に失敗しました。",
    analysisUnexpected: "エージェント分析中に予期しないエラーが発生しました。",
    revisionSaveFailed: "決定の修正を保存できませんでした。",
    revisionUnexpected: "決定の修正中に予期しないエラーが発生しました。",
    dismissalFailed: "矛盾を却下できませんでした。",
    dismissalUnexpected: "矛盾の却下中に予期しないエラーが発生しました。",
    loadingDecision: "デモの決定を読み込んでいます...",
  },
} as const;

const demoTranslations: Record<string, string> = {
  "Aozora Dental Clinic Website": "あおぞら歯科クリニック Webサイト",
  "Do not include online booking in the launch scope.":
    "初回公開の対象にオンライン予約を含めない。",
  "The client confirmed that phone booking is sufficient for the initial release.":
    "顧客は、初回公開では電話予約で十分だと確認しました。",
  "We do not need an online booking feature. Phone booking is sufficient for launch.":
    "オンライン予約機能は不要です。公開時点では電話予約で十分です。",
};

const apiMessageTranslations: Record<string, string> = {
  "A valid demo session is required.": "有効なデモセッションが必要です。",
  "The demo session is invalid or expired.":
    "デモセッションが無効か、有効期限が切れています。",
  "This demo session has used its analysis allowance.":
    "このデモセッションで利用できる分析回数を使い切りました。",
  "The request body exceeds the 16 KiB limit.":
    "リクエスト本文が16 KiBの上限を超えています。",
  "Project memory was not found.": "プロジェクト記憶が見つかりませんでした。",
};

const kindLabels = {
  en: {
    requirement: "requirement",
    decision: "decision",
    rationale: "rationale",
    open_question: "open question",
  },
  ja: {
    requirement: "要件",
    decision: "決定",
    rationale: "判断理由",
    open_question: "未決事項",
  },
} as const;

const statusLabels = {
  en: {
    proposed: "proposed",
    active: "active",
    superseded: "superseded",
    resolved: "resolved",
    dismissed: "dismissed",
  },
  ja: {
    proposed: "提案",
    active: "有効",
    superseded: "更新済み",
    resolved: "解決済み",
    dismissed: "却下済み",
  },
} as const;

export function translateDemoText(value: string, locale: Locale): string {
  return locale === "ja" ? (demoTranslations[value] ?? value) : value;
}

export function translateApiMessage(value: string, locale: Locale): string {
  return locale === "ja" ? (apiMessageTranslations[value] ?? value) : value;
}

const localizedErrorPairs = [
  [copy.en.apiNotConfigured, copy.ja.apiNotConfigured],
  [copy.en.sessionCreateFailed, copy.ja.sessionCreateFailed],
  [copy.en.memoryLoadFailed, copy.ja.memoryLoadFailed],
  [copy.en.memoryRefreshFailed, copy.ja.memoryRefreshFailed],
  [copy.en.analysisFailed, copy.ja.analysisFailed],
  [copy.en.analysisUnexpected, copy.ja.analysisUnexpected],
  [copy.en.revisionSaveFailed, copy.ja.revisionSaveFailed],
  [copy.en.revisionUnexpected, copy.ja.revisionUnexpected],
  [copy.en.dismissalFailed, copy.ja.dismissalFailed],
  [copy.en.dismissalUnexpected, copy.ja.dismissalUnexpected],
] as const;

export function translateKnownError(
  value: string | null,
  locale: Locale,
): string | null {
  if (!value) {
    return value;
  }
  const pair = localizedErrorPairs.find(
    ([english, japanese]) => value === english || value === japanese,
  );
  if (pair) {
    return locale === "ja" ? pair[1] : pair[0];
  }
  return translateApiMessage(value, locale);
}

export function memoryKindLabel(
  kind: keyof (typeof kindLabels)["en"],
  locale: Locale,
): string {
  return kindLabels[locale][kind];
}

export function memoryStatusLabel(
  status: keyof (typeof statusLabels)["en"],
  locale: Locale,
): string {
  return statusLabels[locale][status];
}

export function activeDecisionLabel(count: number, locale: Locale): string {
  if (locale === "ja") {
    return `有効な決定 ${count}件`;
  }
  return `${count} active decision${count === 1 ? "" : "s"}`;
}

export function analysesLeftLabel(count: number, locale: Locale): string {
  return locale === "ja"
    ? `残り${count}回`
    : `${count} ${count === 1 ? "analysis" : "analyses"} left`;
}

export function groundedRecordsLabel(count: number, locale: Locale): string {
  if (locale === "ja") {
    return `${count}件の保存済み記憶を根拠にしています。`;
  }
  return `Grounded in ${count} stored memory record${count === 1 ? "" : "s"}.`;
}

export function agentRunLabel(runId: string, locale: Locale): string {
  return locale === "ja" ? `エージェント実行: ${runId}` : `Agent run: ${runId}`;
}

export function localeNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "ja" ? "ja-JP" : "en-US").format(
    value,
  );
}
