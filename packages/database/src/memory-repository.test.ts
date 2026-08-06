import { describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { CockroachMemoryRepository } from "./memory-repository.js";

const projectId = "10000000-0000-4000-8000-000000000002";
const conversationId = "10000000-0000-4000-8000-000000000003";
const priorMemoryId = "10000000-0000-4000-8000-000000000004";
const runId = "10000000-0000-4000-8000-000000000005";
const replacementMemoryId = "10000000-0000-4000-8000-000000000006";
const newStatement = "Add an online booking button to every page.";
const revisedAt = new Date("2026-08-06T03:00:00.000Z");

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

const revisionInput = {
  projectId,
  agentRunId: runId,
  priorMemoryId,
  reason: "The client approved online booking after changing the launch scope.",
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

describe("CockroachMemoryRepository revisions", () => {
  it("supersedes the prior decision and activates its conflict proposal atomically", async () => {
    const query = vi.fn(async (text: string) => {
      const sql = statement(text);
      if (sql.startsWith("SELECT replacement.id")) {
        return { rowCount: 1, rows: [{ id: replacementMemoryId }] };
      }
      if (sql.startsWith("SELECT id, kind, status")) {
        return {
          rowCount: 2,
          rows: [
            { id: priorMemoryId, kind: "decision", status: "active" },
            {
              id: replacementMemoryId,
              kind: "requirement",
              status: "proposed",
            },
          ],
        };
      }
      if (sql.startsWith("SELECT reason, created_at")) {
        return { rowCount: 0, rows: [] };
      }
      if (sql.startsWith("INSERT INTO memory_links")) {
        return {
          rowCount: 1,
          rows: [{ reason: revisionInput.reason, created_at: revisedAt }],
        };
      }
      return { rowCount: 1, rows: [] };
    });
    const { repository, release } = repositoryWithClient(query);

    await expect(repository.confirmRevision(revisionInput)).resolves.toEqual({
      status: "confirmed",
      priorMemoryId,
      replacementMemoryId,
      reason: revisionInput.reason,
      revisedAt: revisedAt.toISOString(),
      changed: true,
    });

    const statements = query.mock.calls.map(([text]) => statement(text));
    expect(statements).toEqual([
      "BEGIN",
      expect.stringMatching(/^SELECT replacement.id/),
      expect.stringMatching(/^SELECT id, kind, status/),
      expect.stringMatching(/^SELECT reason, created_at/),
      expect.stringMatching(/^UPDATE memory_items SET status = 'superseded'/),
      expect.stringMatching(/^UPDATE memory_items SET kind = 'decision'/),
      expect.stringMatching(/^INSERT INTO memory_links/),
      "COMMIT",
    ]);
    expect(release).toHaveBeenCalledOnce();
  });

  it("returns the stored revision without changing memory on retry", async () => {
    const query = vi.fn(async (text: string) => {
      const sql = statement(text);
      if (sql.startsWith("SELECT replacement.id")) {
        return { rowCount: 1, rows: [{ id: replacementMemoryId }] };
      }
      if (sql.startsWith("SELECT id, kind, status")) {
        return {
          rowCount: 2,
          rows: [
            { id: priorMemoryId, kind: "decision", status: "superseded" },
            {
              id: replacementMemoryId,
              kind: "decision",
              status: "active",
            },
          ],
        };
      }
      if (sql.startsWith("SELECT reason, created_at")) {
        return {
          rowCount: 1,
          rows: [{ reason: revisionInput.reason, created_at: revisedAt }],
        };
      }
      return { rowCount: 1, rows: [] };
    });
    const { repository } = repositoryWithClient(query);

    await expect(repository.confirmRevision(revisionInput)).resolves.toEqual({
      status: "confirmed",
      priorMemoryId,
      replacementMemoryId,
      reason: revisionInput.reason,
      revisedAt: revisedAt.toISOString(),
      changed: false,
    });

    const statements = query.mock.calls.map(([text]) => statement(text));
    expect(statements.some((sql) => sql.startsWith("UPDATE memory_items"))).toBe(
      false,
    );
    expect(statements.some((sql) => sql.startsWith("INSERT INTO memory_links"))).toBe(
      false,
    );
    expect(statements.at(-1)).toBe("COMMIT");
  });

  it("rejects a revision when the prior memory is no longer active", async () => {
    const query = vi.fn(async (text: string) => {
      const sql = statement(text);
      if (sql.startsWith("SELECT replacement.id")) {
        return { rowCount: 1, rows: [{ id: replacementMemoryId }] };
      }
      if (sql.startsWith("SELECT id, kind, status")) {
        return {
          rowCount: 2,
          rows: [
            { id: priorMemoryId, kind: "decision", status: "dismissed" },
            {
              id: replacementMemoryId,
              kind: "requirement",
              status: "proposed",
            },
          ],
        };
      }
      if (sql.startsWith("SELECT reason, created_at")) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 1, rows: [] };
    });
    const { repository } = repositoryWithClient(query);

    await expect(repository.confirmRevision(revisionInput)).resolves.toEqual({
      status: "invalid_state",
    });
    expect(
      query.mock.calls
        .map(([text]) => statement(text))
        .some((sql) => sql.startsWith("UPDATE memory_items")),
    ).toBe(false);
  });

  it("rolls back both memory transitions when the replacement update fails", async () => {
    const query = vi.fn(async (text: string) => {
      const sql = statement(text);
      if (sql.startsWith("SELECT replacement.id")) {
        return { rowCount: 1, rows: [{ id: replacementMemoryId }] };
      }
      if (sql.startsWith("SELECT id, kind, status")) {
        return {
          rowCount: 2,
          rows: [
            { id: priorMemoryId, kind: "decision", status: "active" },
            {
              id: replacementMemoryId,
              kind: "requirement",
              status: "proposed",
            },
          ],
        };
      }
      if (sql.startsWith("SELECT reason, created_at")) {
        return { rowCount: 0, rows: [] };
      }
      if (sql.startsWith("UPDATE memory_items SET kind = 'decision'")) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 1, rows: [] };
    });
    const { repository, release } = repositoryWithClient(query);

    await expect(repository.confirmRevision(revisionInput)).rejects.toThrow(
      "revision memory transition could not be completed",
    );
    expect(query.mock.calls.map(([text]) => statement(text))).toContain(
      "ROLLBACK",
    );
    expect(release).toHaveBeenCalledOnce();
  });
});

describe("CockroachMemoryRepository demo sessions", () => {
  it("creates an isolated project by cloning one active template decision", async () => {
    const query = vi.fn(async (text: string) => {
      const sql = statement(text);
      if (sql.startsWith("SELECT p.name AS project_name")) {
        return {
          rowCount: 1,
          rows: [
            {
              project_name: "Aozora Dental Clinic Website",
              content: "Do not include online booking in the launch scope.",
              rationale: "The launch should remain small.",
              source_quote: "We do not need online booking for launch.",
            },
          ],
        };
      }
      if (sql.startsWith("INSERT INTO memory_items")) {
        return { rowCount: 1, rows: [{ id: "generated" }] };
      }
      return { rowCount: 1, rows: [] };
    });
    const { repository, release } = repositoryWithClient(query);

    const session = await repository.createDemoSession({
      tokenHash: "a".repeat(64),
      templateMemoryId: priorMemoryId,
      expiresAt: "2026-08-06T08:00:00.000Z",
      maxAnalysisRequests: 6,
    });

    expect(session).toMatchObject({
      projectName: "Aozora Dental Clinic Website",
      expiresAt: "2026-08-06T08:00:00.000Z",
      maxAnalysisRequests: 6,
      initialDecision: {
        content: "Do not include online booking in the launch scope.",
      },
    });
    expect(session.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(session.projectId).toMatch(/^[0-9a-f-]{36}$/);
    expect(session.initialDecision.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(query.mock.calls.map(([text]) => statement(text))).toEqual([
      "BEGIN",
      expect.stringMatching(/^SELECT p.name AS project_name/),
      expect.stringMatching(/^INSERT INTO demo_sessions/),
      expect.stringMatching(/^INSERT INTO projects/),
      expect.stringMatching(/^INSERT INTO conversations/),
      expect.stringMatching(/^INSERT INTO memory_items/),
      "COMMIT",
    ]);
    expect(release).toHaveBeenCalledOnce();
  });

  it("atomically consumes one analysis allowance", async () => {
    const query = vi.fn().mockResolvedValue({
      rowCount: 1,
      rows: [{ remaining_analysis_requests: "5" }],
    });
    const pool = { query } as unknown as Pool;
    const repository = new CockroachMemoryRepository(pool);

    await expect(
      repository.authorizeDemoRequest({
        tokenHash: "b".repeat(64),
        projectId,
        consumeAnalysisRequest: true,
      }),
    ).resolves.toEqual({
      status: "authorized",
      remainingAnalysisRequests: 5,
    });
    expect(statement(query.mock.calls[0]?.[0])).toContain(
      "SET analysis_requests = analysis_requests + 1",
    );
    expect(query).toHaveBeenCalledOnce();
  });

  it("distinguishes an exhausted allowance from an invalid session", async () => {
    const limitedQuery = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ "?column?": 1 }] });
    const limitedRepository = new CockroachMemoryRepository({
      query: limitedQuery,
    } as unknown as Pool);

    await expect(
      limitedRepository.authorizeDemoRequest({
        tokenHash: "c".repeat(64),
        projectId,
        consumeAnalysisRequest: true,
      }),
    ).resolves.toEqual({ status: "rate_limited" });

    const unauthorizedQuery = vi
      .fn()
      .mockResolvedValue({ rowCount: 0, rows: [] });
    const unauthorizedRepository = new CockroachMemoryRepository({
      query: unauthorizedQuery,
    } as unknown as Pool);
    await expect(
      unauthorizedRepository.authorizeDemoRequest({
        tokenHash: "d".repeat(64),
        projectId,
        consumeAnalysisRequest: true,
      }),
    ).resolves.toEqual({ status: "unauthorized" });
  });
});
