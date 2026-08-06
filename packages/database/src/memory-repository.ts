import { randomUUID } from "node:crypto";
import type {
  ConfirmRevisionResult,
  DemoSessionAuthorization,
  DemoSessionRepository,
  MemoryRepository,
  RevisionRepository,
} from "@scopethread/core";
import type { Pool } from "pg";
import { retrieveSimilarMemories, toVectorLiteral } from "./vector.js";

type MemoryStateRow = {
  id: string;
  kind: string;
  status: string;
};

type RevisionLinkRow = {
  reason: string | null;
  created_at: Date | string;
};

type DemoTemplateRow = {
  project_name: string;
  content: string;
  rationale: string | null;
  source_quote: string;
};

type SessionAuthorizationRow = {
  remaining_analysis_requests: string | number;
};

function toIsoTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("CockroachDB returned an invalid revision timestamp.");
  }
  return date.toISOString();
}

export class CockroachMemoryRepository
  implements MemoryRepository, RevisionRepository, DemoSessionRepository
{
  constructor(private readonly pool: Pool) {}

  async createDemoSession(
    input: Parameters<DemoSessionRepository["createDemoSession"]>[0],
  ) {
    const sessionId = randomUUID();
    const projectId = randomUUID();
    const conversationId = randomUUID();
    const memoryId = randomUUID();
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const templateResult = await client.query<DemoTemplateRow>(
        `SELECT p.name AS project_name,
                m.content,
                m.rationale,
                m.source_quote
         FROM memory_items AS m
         JOIN projects AS p ON p.id = m.project_id
         WHERE m.id = $1
           AND m.kind = 'decision'
           AND m.status = 'active'
           AND m.embedding IS NOT NULL`,
        [input.templateMemoryId],
      );
      const template = templateResult.rows[0];
      if (!template || templateResult.rows.length !== 1) {
        throw new Error("The demo template decision is unavailable.");
      }

      await client.query(
        `INSERT INTO demo_sessions (
           id,
           expires_at,
           token_hash,
           max_analysis_requests
         )
         VALUES ($1, $2, $3, $4)`,
        [
          sessionId,
          input.expiresAt,
          input.tokenHash,
          input.maxAnalysisRequests,
        ],
      );
      await client.query(
        `INSERT INTO projects (id, demo_session_id, name)
         VALUES ($1, $2, $3)`,
        [projectId, sessionId, template.project_name],
      );
      await client.query(
        `INSERT INTO conversations (
           id,
           project_id,
           idempotency_key,
           source_text
         )
         SELECT $1, $2, $3, c.source_text
         FROM memory_items AS m
         JOIN conversations AS c ON c.id = m.source_conversation_id
         WHERE m.id = $4`,
        [conversationId, projectId, `session-bootstrap:${memoryId}`, input.templateMemoryId],
      );
      const memoryResult = await client.query(
        `INSERT INTO memory_items (
           id,
           project_id,
           source_conversation_id,
           kind,
           status,
           content,
           rationale,
           source_quote,
           confidence,
           embedding
         )
         SELECT $1,
                $2,
                $3,
                kind,
                status,
                content,
                rationale,
                source_quote,
                confidence,
                embedding
         FROM memory_items
         WHERE id = $4
         RETURNING id`,
        [memoryId, projectId, conversationId, input.templateMemoryId],
      );
      if (memoryResult.rowCount !== 1) {
        throw new Error("The demo template decision could not be cloned.");
      }

      await client.query("COMMIT");
      return {
        sessionId,
        projectId,
        projectName: template.project_name,
        initialDecision: {
          id: memoryId,
          content: template.content,
          rationale: template.rationale,
          sourceQuote: template.source_quote,
        },
        expiresAt: toIsoTimestamp(input.expiresAt),
        maxAnalysisRequests: input.maxAnalysisRequests,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async authorizeDemoRequest(
    input: Parameters<DemoSessionRepository["authorizeDemoRequest"]>[0],
  ): Promise<DemoSessionAuthorization> {
    if (input.consumeAnalysisRequest) {
      const result = await this.pool.query<SessionAuthorizationRow>(
        `UPDATE demo_sessions AS session
         SET analysis_requests = analysis_requests + 1
         FROM projects AS project
         WHERE session.token_hash = $1
           AND project.id = $2
           AND project.demo_session_id = session.id
           AND session.expires_at > now()
           AND session.analysis_requests < session.max_analysis_requests
         RETURNING
           session.max_analysis_requests - session.analysis_requests
             AS remaining_analysis_requests`,
        [input.tokenHash, input.projectId],
      );
      const authorized = result.rows[0];
      if (authorized) {
        return {
          status: "authorized",
          remainingAnalysisRequests: Number(
            authorized.remaining_analysis_requests,
          ),
        };
      }
    } else {
      const result = await this.pool.query<SessionAuthorizationRow>(
        `SELECT max_analysis_requests - analysis_requests
                  AS remaining_analysis_requests
         FROM demo_sessions AS session
         JOIN projects AS project ON project.demo_session_id = session.id
         WHERE session.token_hash = $1
           AND project.id = $2
           AND session.expires_at > now()`,
        [input.tokenHash, input.projectId],
      );
      const authorized = result.rows[0];
      if (authorized) {
        return {
          status: "authorized",
          remainingAnalysisRequests: Math.max(
            0,
            Number(authorized.remaining_analysis_requests),
          ),
        };
      }
    }

    const sessionResult = await this.pool.query(
      `SELECT 1
       FROM demo_sessions AS session
       JOIN projects AS project ON project.demo_session_id = session.id
       WHERE session.token_hash = $1
         AND project.id = $2
         AND session.expires_at > now()`,
      [input.tokenHash, input.projectId],
    );
    return sessionResult.rowCount === 1
      ? { status: "rate_limited" }
      : { status: "unauthorized" };
  }

  async startAgentRun(
    input: Parameters<MemoryRepository["startAgentRun"]>[0],
  ): Promise<{ runId: string }> {
    const runId = randomUUID();
    await this.pool.query(
      `INSERT INTO agent_runs (
         id,
         project_id,
         status,
         chat_model_id,
         embedding_model_id
       )
       VALUES ($1, $2, 'started', $3, $4)`,
      [runId, input.projectId, input.chatModelId, input.embeddingModelId],
    );
    return { runId };
  }

  retrieveRelevant(
    input: Parameters<MemoryRepository["retrieveRelevant"]>[0],
  ) {
    return retrieveSimilarMemories({
      pool: this.pool,
      projectId: input.projectId,
      embedding: input.queryEmbedding,
      limit: input.limit,
    });
  }

  async saveAnalysis(
    input: Parameters<MemoryRepository["saveAnalysis"]>[0],
  ): Promise<{ conversationId: string; persisted: boolean }> {
    if (
      input.memoryEmbeddings.length !== input.result.extractedMemories.length
    ) {
      throw new Error("Each extracted memory must have one embedding.");
    }

    const memoryIds = input.result.extractedMemories.map(() => randomUUID());
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const conversationResult = await client.query<{ id: string }>(
        `
          INSERT INTO conversations (
            project_id,
            idempotency_key,
            source_text
          )
          VALUES ($1, $2, $3)
          ON CONFLICT (project_id, idempotency_key) DO NOTHING
          RETURNING id
        `,
        [
          input.request.projectId,
          input.request.idempotencyKey,
          input.request.conversationText,
        ],
      );

      let conversationId = conversationResult.rows[0]?.id;
      const persisted = Boolean(conversationId);
      if (!conversationId) {
        const existingConversation = await client.query<{ id: string }>(
          `SELECT id
           FROM conversations
           WHERE project_id = $1 AND idempotency_key = $2`,
          [input.request.projectId, input.request.idempotencyKey],
        );
        conversationId = existingConversation.rows[0]?.id;
        if (!conversationId) {
          throw new Error("The idempotent conversation could not be read.");
        }
      }

      if (persisted) {
        for (const [index, memory] of input.result.extractedMemories.entries()) {
          const memoryId = memoryIds[index];
          const embedding = input.memoryEmbeddings[index];
          if (!memoryId || !embedding) {
            throw new Error("Memory and embedding indexes are inconsistent.");
          }

          await client.query(
            `
          INSERT INTO memory_items (
              id,
              project_id,
              source_conversation_id,
              kind,
              status,
              content,
              rationale,
              source_quote,
              confidence,
              embedding
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::VECTOR)
          `,
            [
              memoryId,
              input.request.projectId,
              conversationId,
              memory.kind,
              memory.status,
              memory.content,
              memory.rationale,
              memory.sourceQuote,
              memory.confidence,
              toVectorLiteral(embedding),
            ],
          );
        }

        for (const conflict of input.result.conflicts) {
          const conflictIndex = input.result.extractedMemories.findIndex(
            (memory) =>
              memory.sourceQuote === conflict.newStatement ||
              memory.content === conflict.newStatement,
          );
          const fromMemoryId =
            memoryIds[conflictIndex >= 0 ? conflictIndex : 0];
          if (!fromMemoryId) {
            throw new Error("A conflict requires a new memory item to link.");
          }

          await client.query(
            `
          INSERT INTO memory_links (
              project_id,
              from_memory_id,
              to_memory_id,
              relation,
              reason
            )
            VALUES ($1, $2, $3, 'conflicts_with', $4)
            ON CONFLICT (from_memory_id, to_memory_id, relation) DO NOTHING
          `,
            [
              input.request.projectId,
              fromMemoryId,
              conflict.priorMemoryId,
              conflict.explanation,
            ],
          );
        }
      }

      const runResult = await client.query(
        `UPDATE agent_runs
         SET status = 'succeeded',
             conversation_id = $3,
             duration_ms = $4,
             error_code = NULL
         WHERE id = $1 AND project_id = $2 AND status = 'started'`,
        [
          input.runId,
          input.request.projectId,
          conversationId,
          input.durationMs,
        ],
      );
      if (runResult.rowCount !== 1) {
        throw new Error("The started agent run could not be completed.");
      }

      await client.query("COMMIT");
      return { conversationId, persisted };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async failAgentRun(
    input: Parameters<MemoryRepository["failAgentRun"]>[0],
  ): Promise<void> {
    const result = await this.pool.query(
      `UPDATE agent_runs
       SET status = 'failed',
           duration_ms = $3,
           error_code = $4
       WHERE id = $1 AND project_id = $2 AND status = 'started'`,
      [input.runId, input.projectId, input.durationMs, input.errorCode],
    );
    if (result.rowCount !== 1) {
      throw new Error("The started agent run could not be marked as failed.");
    }
  }

  async confirmRevision(
    input: Parameters<RevisionRepository["confirmRevision"]>[0],
  ): Promise<ConfirmRevisionResult> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const candidateResult = await client.query<{ id: string }>(
        `SELECT replacement.id
         FROM agent_runs AS run
         JOIN memory_items AS replacement
           ON replacement.project_id = run.project_id
          AND replacement.source_conversation_id = run.conversation_id
         JOIN memory_links AS conflict
           ON conflict.project_id = run.project_id
          AND conflict.from_memory_id = replacement.id
          AND conflict.to_memory_id = $3
          AND conflict.relation = 'conflicts_with'
         WHERE run.id = $2
           AND run.project_id = $1
           AND run.status = 'succeeded'
         ORDER BY replacement.created_at, replacement.id`,
        [input.projectId, input.agentRunId, input.priorMemoryId],
      );

      if (candidateResult.rows.length === 0) {
        await client.query("COMMIT");
        return { status: "not_found" };
      }
      if (candidateResult.rows.length !== 1) {
        await client.query("COMMIT");
        return { status: "invalid_state" };
      }

      const replacementMemoryId = candidateResult.rows[0]?.id;
      if (!replacementMemoryId) {
        throw new Error("The revision candidate did not include an ID.");
      }

      const stateResult = await client.query<MemoryStateRow>(
        `SELECT id, kind, status
         FROM memory_items
         WHERE project_id = $1
           AND (id = $2 OR id = $3)
         FOR UPDATE`,
        [input.projectId, input.priorMemoryId, replacementMemoryId],
      );
      const prior = stateResult.rows.find(
        (memory) => memory.id === input.priorMemoryId,
      );
      const replacement = stateResult.rows.find(
        (memory) => memory.id === replacementMemoryId,
      );
      if (!prior || !replacement) {
        await client.query("COMMIT");
        return { status: "not_found" };
      }

      const linkResult = await client.query<RevisionLinkRow>(
        `SELECT reason, created_at
         FROM memory_links
         WHERE project_id = $1
           AND from_memory_id = $2
           AND to_memory_id = $3
           AND relation = 'supersedes'`,
        [input.projectId, replacementMemoryId, input.priorMemoryId],
      );
      const existingLink = linkResult.rows[0];
      if (existingLink) {
        if (
          prior.kind !== "decision" ||
          prior.status !== "superseded" ||
          replacement.kind !== "decision" ||
          replacement.status !== "active" ||
          !existingLink.reason
        ) {
          await client.query("COMMIT");
          return { status: "invalid_state" };
        }

        await client.query("COMMIT");
        return {
          status: "confirmed",
          priorMemoryId: input.priorMemoryId,
          replacementMemoryId,
          reason: existingLink.reason,
          revisedAt: toIsoTimestamp(existingLink.created_at),
          changed: false,
        };
      }

      if (
        prior.kind !== "decision" ||
        prior.status !== "active" ||
        !["decision", "requirement"].includes(replacement.kind) ||
        replacement.status !== "proposed"
      ) {
        await client.query("COMMIT");
        return { status: "invalid_state" };
      }

      const priorUpdate = await client.query(
        `UPDATE memory_items
         SET status = 'superseded', updated_at = now()
         WHERE project_id = $1
           AND id = $2
           AND kind = 'decision'
           AND status = 'active'`,
        [input.projectId, input.priorMemoryId],
      );
      const replacementUpdate = await client.query(
        `UPDATE memory_items
         SET kind = 'decision',
             status = 'active',
             rationale = $3,
             updated_at = now()
         WHERE project_id = $1
           AND id = $2
           AND kind IN ('decision', 'requirement')
           AND status = 'proposed'`,
        [input.projectId, replacementMemoryId, input.reason],
      );
      if (priorUpdate.rowCount !== 1 || replacementUpdate.rowCount !== 1) {
        throw new Error("The revision memory transition could not be completed.");
      }

      const insertedLink = await client.query<RevisionLinkRow>(
        `INSERT INTO memory_links (
           project_id,
           from_memory_id,
           to_memory_id,
           relation,
           reason
         )
         VALUES ($1, $2, $3, 'supersedes', $4)
         RETURNING reason, created_at`,
        [
          input.projectId,
          replacementMemoryId,
          input.priorMemoryId,
          input.reason,
        ],
      );
      const revisionLink = insertedLink.rows[0];
      if (!revisionLink?.reason) {
        throw new Error("The revision link could not be read after insertion.");
      }

      await client.query("COMMIT");
      return {
        status: "confirmed",
        priorMemoryId: input.priorMemoryId,
        replacementMemoryId,
        reason: revisionLink.reason,
        revisedAt: toIsoTimestamp(revisionLink.created_at),
        changed: true,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
