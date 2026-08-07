import {
  AnalysisResultSchema,
  AnalyzeConversationRequestSchema,
  type AnalysisResult,
} from "./models.js";
import type {
  ConversationAnalyzer,
  EmbeddingProvider,
  MemoryRepository,
} from "./ports.js";

type AnalysisStage =
  | "query_embedding"
  | "memory_retrieval"
  | "analysis"
  | "memory_embedding"
  | "persistence";

export type AnalyzeConversationOptions = {
  chatModelId: string;
  embeddingModelId: string;
  now?: () => number;
};

export type AnalyzeConversationOutcome = {
  runId: string;
  conversationId: string;
  persisted: boolean;
  result: AnalysisResult;
};

export class AnalyzeConversationError extends Error {
  override readonly name = "AnalyzeConversationError";

  constructor(
    readonly runId: string,
    readonly errorCode: string,
    options: { cause: unknown },
  ) {
    super(`Agent analysis failed (${errorCode}).`, options);
  }
}

function durationMs(startedAt: number, now: () => number): number {
  return Math.max(0, Math.round(now() - startedAt));
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

const modelOutputIssues = new Set([
  "no_text",
  "invalid_json",
  "schema_mismatch",
  "unknown_evidence",
  "missing_evidence",
  "ungrounded_source_quote",
  "unlinked_conflict",
]);

function modelOutputIssue(error: unknown): string | null {
  if (
    error instanceof Error &&
    error.name === "ModelOutputError" &&
    "issue" in error &&
    typeof error.issue === "string" &&
    modelOutputIssues.has(error.issue)
  ) {
    return error.issue.toUpperCase();
  }
  return null;
}

function classifyError(stage: AnalysisStage, error: unknown): string {
  const name = errorName(error);
  if (name === "ThrottlingException") {
    return "BEDROCK_THROTTLED";
  }
  if (
    stage === "analysis" &&
    ["ModelOutputError", "SyntaxError", "ZodError"].includes(name)
  ) {
    const issue = modelOutputIssue(error);
    return issue ? `MODEL_OUTPUT_${issue}` : "MODEL_OUTPUT_INVALID";
  }

  return {
    query_embedding: "QUERY_EMBEDDING_FAILED",
    memory_retrieval: "MEMORY_RETRIEVAL_FAILED",
    analysis: "MODEL_ANALYSIS_FAILED",
    memory_embedding: "MEMORY_EMBEDDING_FAILED",
    persistence: "PERSISTENCE_FAILED",
  }[stage];
}

export class AnalyzeConversation {
  constructor(
    private readonly repository: MemoryRepository,
    private readonly analyzer: ConversationAnalyzer,
    private readonly embeddings: EmbeddingProvider,
    private readonly options: AnalyzeConversationOptions,
  ) {}

  async execute(input: unknown): Promise<AnalyzeConversationOutcome> {
    const request = AnalyzeConversationRequestSchema.parse(input);
    const now = this.options.now ?? Date.now;
    const startedAt = now();
    const { runId } = await this.repository.startAgentRun({
      projectId: request.projectId,
      chatModelId: this.options.chatModelId,
      embeddingModelId: this.options.embeddingModelId,
    });
    let stage: AnalysisStage = "query_embedding";

    try {
      const queryEmbedding = await this.embeddings.embedQuery(
        request.conversationText,
      );
      stage = "memory_retrieval";
      const retrievedMemories = await this.repository.retrieveRelevant({
        projectId: request.projectId,
        queryEmbedding,
        limit: 8,
      });

      stage = "analysis";
      const rawResult = await this.analyzer.analyze({
        request,
        retrievedMemories,
      });
      const result = AnalysisResultSchema.parse(rawResult);

      stage = "memory_embedding";
      const memoryEmbeddings = await Promise.all(
        result.extractedMemories.map((memory) =>
          this.embeddings.embedDocument(
            [memory.content, memory.rationale].filter(Boolean).join("\n"),
          ),
        ),
      );

      stage = "persistence";
      const saved = await this.repository.saveAnalysis({
        request,
        result,
        memoryEmbeddings,
        runId,
        durationMs: durationMs(startedAt, now),
      });
      return { runId, ...saved, result };
    } catch (error) {
      const errorCode = classifyError(stage, error);
      try {
        await this.repository.failAgentRun({
          projectId: request.projectId,
          runId,
          durationMs: durationMs(startedAt, now),
          errorCode,
        });
      } catch (trackingError) {
        throw new AnalyzeConversationError(runId, "RUN_TRACKING_FAILED", {
          cause: new AggregateError([error, trackingError]),
        });
      }
      throw new AnalyzeConversationError(runId, errorCode, { cause: error });
    }
  }
}
