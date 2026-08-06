import { describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { CockroachMemoryRepository } from "./memory-repository.js";

const projectId = "10000000-0000-4000-8000-000000000002";
const conversationId = "10000000-0000-4000-8000-000000000003";
const priorMemoryId = "10000000-0000-4000-8000-000000000004";
const runId = "10000000-0000-4000-8000-000000000005";
const newStatement = "Add an online booking button to every page.";

const saveInput = {
  request: {
    projectId,
    conversationText: newStatement,
    idempotencyKey: "memory-repository-test-001",
  },
  result: {
    summary: "The new request conflicts with the launch decision.",
    extractedMemories: [
      {
        kind: "requirement" as const,
        status: "proposed" as const,
        content: newStatement,
        rationale: null,
        sourceQuote: newStatement,
        confidence: 0.95,
      },
    ],
    conflicts: [
      {
        priorMemoryId,
        newStatement,
        explanation: "Online booking was excluded from launch.",
        confirmationQuestion: "Should the launch decision be superseded?",
      },
    ],
    nextQuestions: ["Should the launch decision be superseded?"],
    retrievedEvidenceIds: [priorMemoryId],
  },
  memoryEmbeddings: [Array.from({ length: 1024 }, () => 0.25)],
  runId,
  durationMs: 125,
};

function statement(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function repositoryWithClient(
  query: ReturnType<typeof vi.fn>,
): {
  repository: CockroachMemoryRepository;
  release: ReturnType<typeof vi.fn>;
} {
  const release = vi.fn();
  const client = { query, release } as unknown as PoolClient;
  const pool = {
    connect: vi.fn().mockResolvedValue(client),
    query: vi.fn(),
  } as unknown as Pool;
  return { repository: new CockroachMemoryRepository(pool), release };
}

describe("CockroachMemoryRepository agent runs", () => {
  it("starts a run with model identifiers before analysis", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] });
    const pool = { query } as unknown as Pool;
    const repository = new CockroachMemoryRepository(pool);

    const started = await repository.startAgentRun({
      projectId,
      chatModelId: "global.amazon.nova-2-lite-v1:0",
      embeddingModelId: "cohere.embed-multilingual-v3",
    });

    expect(started.runId).toMatch(/^[0-9a-f-]{36}$/);
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[1]).toEqual([
      started.runId,
      projectId,
      "global.amazon.nova-2-lite-v1:0",
      "cohere.embed-multilingual-v3",
    ]);
  });

  it("commits memory and a succeeded run in the same transaction", async () => {
    const query = vi.fn(async (text: string) => {
      const sql = statement(text);
      if (sql.startsWith("INSERT INTO conversations")) {
        return { rowCount: 1, rows: [{ id: conversationId }] };
      }
      if (sql.startsWith("UPDATE agent_runs")) {
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 1, rows: [] };
    });
    const { repository, release } = repositoryWithClient(query);

    await expect(repository.saveAnalysis(saveInput)).resolves.toEqual({
      conversationId,
      persisted: true,
    });

    const statements = query.mock.calls.map(([text]) => statement(text));
    expect(statements).toEqual([
      "BEGIN",
      expect.stringMatching(/^INSERT INTO conversations/),
      expect.stringMatching(/^INSERT INTO memory_items/),
      expect.stringMatching(/^INSERT INTO memory_links/),
      expect.stringMatching(/^UPDATE agent_runs/),
      "COMMIT",
    ]);
    expect(statements[4]).toContain("status = 'succeeded'");
    expect(release).toHaveBeenCalledOnce();
  });

  it("rolls back memory when the transaction cannot complete the run", async () => {
    const query = vi.fn(async (text: string) => {
      const sql = statement(text);
      if (sql.startsWith("INSERT INTO conversations")) {
        return { rowCount: 1, rows: [{ id: conversationId }] };
      }
      if (sql.startsWith("UPDATE agent_runs")) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 1, rows: [] };
    });
    const { repository, release } = repositoryWithClient(query);

    await expect(repository.saveAnalysis(saveInput)).rejects.toThrow(
      "started agent run could not be completed",
    );

    const statements = query.mock.calls.map(([text]) => statement(text));
    expect(statements).toContain("ROLLBACK");
    expect(statements).not.toContain("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });

  it("links an idempotent retry to the existing conversation without duplicate memory", async () => {
    const query = vi.fn(async (text: string) => {
      const sql = statement(text);
      if (sql.startsWith("INSERT INTO conversations")) {
        return { rowCount: 0, rows: [] };
      }
      if (sql.startsWith("SELECT id FROM conversations")) {
        return { rowCount: 1, rows: [{ id: conversationId }] };
      }
      if (sql.startsWith("UPDATE agent_runs")) {
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 1, rows: [] };
    });
    const { repository } = repositoryWithClient(query);

    await expect(repository.saveAnalysis(saveInput)).resolves.toEqual({
      conversationId,
      persisted: false,
    });

    const statements = query.mock.calls.map(([text]) => statement(text));
    expect(
      statements.some((sql) => sql.startsWith("INSERT INTO memory_items")),
    ).toBe(false);
    expect(
      statements.some((sql) => sql.startsWith("INSERT INTO memory_links")),
    ).toBe(false);
    expect(
      statements.some((sql) => sql.startsWith("UPDATE agent_runs")),
    ).toBe(true);
  });

  it("stores only a safe error code when marking a run failed", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] });
    const pool = { query } as unknown as Pool;
    const repository = new CockroachMemoryRepository(pool);

    await repository.failAgentRun({
      projectId,
      runId,
      durationMs: 250,
      errorCode: "BEDROCK_THROTTLED",
    });

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[1]).toEqual([
      runId,
      projectId,
      250,
      "BEDROCK_THROTTLED",
    ]);
  });
});
