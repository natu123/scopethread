import { describe, expect, it } from "vitest";
import { AnalyzeConversation } from "./analyze-conversation.js";
import { DemoConversationAnalyzer } from "./demo-analyzer.js";
import type { AnalysisResult, AnalyzeConversationRequest, StoredMemory } from "./models.js";
import type { EmbeddingProvider, MemoryRepository } from "./ports.js";

const projectId = "018f47a2-65ec-7d35-a5df-4a5f40b46084";
const conversationId = "018f47a2-65ec-7d35-a5df-4a5f40b46085";
const memoryId = "018f47a2-65ec-7d35-a5df-4a5f40b46086";
const runId = "018f47a2-65ec-7d35-a5df-4a5f40b46087";
const savedConversationId = "018f47a2-65ec-7d35-a5df-4a5f40b46088";

type SavedAnalysis = {
  request: AnalyzeConversationRequest;
  result: AnalysisResult;
  memoryEmbeddings: number[][];
  runId: string;
  durationMs: number;
};

type FailedRun = {
  projectId: string;
  runId: string;
  durationMs: number;
  errorCode: string;
};

class FakeRepository implements MemoryRepository {
  saved: SavedAnalysis[] = [];
  started: Parameters<MemoryRepository["startAgentRun"]>[0][] = [];
  failed: FailedRun[] = [];

  constructor(private readonly memories: StoredMemory[]) {}

  async startAgentRun(
    input: Parameters<MemoryRepository["startAgentRun"]>[0],
  ): Promise<{ runId: string }> {
    this.started.push(input);
    return { runId };
  }

  async retrieveRelevant(input: {
    projectId: string;
    queryEmbedding: number[];
    limit: number;
  }): Promise<StoredMemory[]> {
    return this.memories
      .filter((memory) => memory.projectId === input.projectId)
      .slice(0, input.limit);
  }

  async saveAnalysis(
    input: SavedAnalysis,
  ): Promise<{ conversationId: string; persisted: boolean }> {
    this.saved.push(input);
    return { conversationId: savedConversationId, persisted: true };
  }

  async failAgentRun(input: FailedRun): Promise<void> {
    this.failed.push(input);
  }
}

class FakeEmbeddings implements EmbeddingProvider {
  readonly queryCalls: string[] = [];
  readonly documentCalls: string[] = [];

  async embedQuery(text: string): Promise<number[]> {
    this.queryCalls.push(text);
    return Array.from({ length: 1024 }, () => 0.25);
  }

  async embedDocument(text: string): Promise<number[]> {
    this.documentCalls.push(text);
    return Array.from({ length: 1024 }, () => 0.5);
  }
}

function options() {
  let now = 1_000;
  return {
    chatModelId: "global.amazon.nova-2-lite-v1:0",
    embeddingModelId: "cohere.embed-multilingual-v3",
    now: () => (now += 25),
  };
}

const priorDecision: StoredMemory = {
  id: memoryId,
  projectId,
  sourceConversationId: conversationId,
  kind: "decision",
  status: "active",
  content: "The website does not need a booking feature.",
  rationale: "The client handles inquiries by phone.",
  createdAt: "2026-08-04T00:00:00.000Z",
};

describe("AnalyzeConversation", () => {
  it("grounds a conflict in project-scoped prior memory", async () => {
    const repository = new FakeRepository([priorDecision]);
    const embeddings = new FakeEmbeddings();
    const useCase = new AnalyzeConversation(
      repository,
      new DemoConversationAnalyzer(),
      embeddings,
      options(),
    );

    const outcome = await useCase.execute({
      projectId,
      conversationText: "Add a booking button to every page.",
      idempotencyKey: "demo-request-001",
    });

    expect(outcome.runId).toBe(runId);
    expect(outcome.conversationId).toBe(savedConversationId);
    expect(outcome.persisted).toBe(true);
    expect(outcome.result.conflicts).toHaveLength(1);
    expect(outcome.result.conflicts[0]?.priorMemoryId).toBe(memoryId);
    expect(outcome.result.retrievedEvidenceIds).toEqual([memoryId]);
    expect(repository.started).toEqual([
      {
        projectId,
        chatModelId: "global.amazon.nova-2-lite-v1:0",
        embeddingModelId: "cohere.embed-multilingual-v3",
      },
    ]);
    expect(repository.saved).toHaveLength(1);
    expect(repository.saved[0]?.memoryEmbeddings[0]).toHaveLength(1024);
    expect(repository.saved[0]?.runId).toBe(runId);
    expect(repository.saved[0]?.durationMs).toBe(25);
    expect(repository.failed).toHaveLength(0);
    expect(embeddings.queryCalls).toEqual([
      "Add a booking button to every page.",
    ]);
    expect(embeddings.documentCalls).toHaveLength(1);
  });

  it("does not persist malformed model output", async () => {
    const repository = new FakeRepository([priorDecision]);
    const embeddings = new FakeEmbeddings();
    const useCase = new AnalyzeConversation(
      repository,
      {
        analyze: async () => ({ summary: "Missing required fields" }),
      },
      embeddings,
      options(),
    );

    await expect(
      useCase.execute({
        projectId,
        conversationText: "Add a booking button.",
        idempotencyKey: "demo-request-002",
      }),
    ).rejects.toMatchObject({
      name: "AnalyzeConversationError",
      runId,
      errorCode: "MODEL_OUTPUT_INVALID",
    });
    expect(repository.saved).toHaveLength(0);
    expect(repository.failed).toEqual([
      {
        projectId,
        runId,
        durationMs: 25,
        errorCode: "MODEL_OUTPUT_INVALID",
      },
    ]);
    expect(embeddings.documentCalls).toHaveLength(0);
  });

  it("records a safe model-output issue without storing generated content", async () => {
    const repository = new FakeRepository([priorDecision]);
    const embeddings = new FakeEmbeddings();
    const invalidOutput = new Error("Sensitive model output must not be stored.") as Error & {
      issue: string;
    };
    invalidOutput.name = "ModelOutputError";
    invalidOutput.issue = "unlinked_conflict";
    const useCase = new AnalyzeConversation(
      repository,
      {
        analyze: async () => {
          throw invalidOutput;
        },
      },
      embeddings,
      options(),
    );

    await expect(
      useCase.execute({
        projectId,
        conversationText: "Add a booking button.",
        idempotencyKey: "demo-request-issue-001",
      }),
    ).rejects.toMatchObject({
      errorCode: "MODEL_OUTPUT_UNLINKED_CONFLICT",
      runId,
    });
    expect(repository.failed[0]?.errorCode).toBe(
      "MODEL_OUTPUT_UNLINKED_CONFLICT",
    );
    expect(repository.failed[0]).not.toHaveProperty("message");
    expect(repository.saved).toHaveLength(0);
  });

  it("does not expose an unrecognized model-output issue", async () => {
    const repository = new FakeRepository([priorDecision]);
    const embeddings = new FakeEmbeddings();
    const invalidOutput = new Error("Unexpected output detail.") as Error & {
      issue: string;
    };
    invalidOutput.name = "ModelOutputError";
    invalidOutput.issue = "conversation_contents";
    const useCase = new AnalyzeConversation(
      repository,
      {
        analyze: async () => {
          throw invalidOutput;
        },
      },
      embeddings,
      options(),
    );

    await expect(
      useCase.execute({
        projectId,
        conversationText: "Add a booking button.",
        idempotencyKey: "demo-request-issue-002",
      }),
    ).rejects.toMatchObject({ errorCode: "MODEL_OUTPUT_INVALID", runId });
    expect(repository.failed[0]?.errorCode).toBe("MODEL_OUTPUT_INVALID");
  });

  it("rejects empty conversations before retrieval", async () => {
    const repository = new FakeRepository([priorDecision]);
    const embeddings = new FakeEmbeddings();
    const useCase = new AnalyzeConversation(
      repository,
      new DemoConversationAnalyzer(),
      embeddings,
      options(),
    );

    await expect(
      useCase.execute({
        projectId,
        conversationText: "   ",
        idempotencyKey: "demo-request-003",
      }),
    ).rejects.toThrow();
    expect(repository.started).toHaveLength(0);
    expect(repository.failed).toHaveLength(0);
    expect(repository.saved).toHaveLength(0);
    expect(embeddings.queryCalls).toHaveLength(0);
  });

  it("records a throttled Bedrock query without saving memory", async () => {
    const repository = new FakeRepository([priorDecision]);
    const throttled = new Error("Daily quota is unavailable.");
    throttled.name = "ThrottlingException";
    const embeddings: EmbeddingProvider = {
      embedQuery: async () => {
        throw throttled;
      },
      embedDocument: async () => [],
    };
    const useCase = new AnalyzeConversation(
      repository,
      new DemoConversationAnalyzer(),
      embeddings,
      options(),
    );

    await expect(
      useCase.execute({
        projectId,
        conversationText: "Add a booking button.",
        idempotencyKey: "demo-request-004",
      }),
    ).rejects.toMatchObject({ errorCode: "BEDROCK_THROTTLED", runId });
    expect(repository.saved).toHaveLength(0);
    expect(repository.failed[0]?.errorCode).toBe("BEDROCK_THROTTLED");
  });
});
