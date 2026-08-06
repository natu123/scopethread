import type {
  AnalysisResult,
  AnalyzeConversationRequest,
  StoredMemory,
} from "./models.js";

export type AnalyzeContext = {
  request: AnalyzeConversationRequest;
  retrievedMemories: StoredMemory[];
};

export interface ConversationAnalyzer {
  analyze(context: AnalyzeContext): Promise<unknown>;
}

export interface EmbeddingProvider {
  embedQuery(text: string): Promise<number[]>;
  embedDocument(text: string): Promise<number[]>;
}

export interface MemoryRepository {
  startAgentRun(input: {
    projectId: string;
    chatModelId: string;
    embeddingModelId: string;
  }): Promise<{ runId: string }>;

  retrieveRelevant(input: {
    projectId: string;
    queryEmbedding: number[];
    limit: number;
  }): Promise<StoredMemory[]>;

  saveAnalysis(input: {
    request: AnalyzeConversationRequest;
    result: AnalysisResult;
    memoryEmbeddings: number[][];
    runId: string;
    durationMs: number;
  }): Promise<{ conversationId: string; persisted: boolean }>;

  failAgentRun(input: {
    projectId: string;
    runId: string;
    durationMs: number;
    errorCode: string;
  }): Promise<void>;
}
