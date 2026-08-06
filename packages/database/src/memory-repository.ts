import { randomUUID } from "node:crypto";
import type { MemoryRepository } from "@scopethread/core";
import type { Pool } from "pg";
import { retrieveSimilarMemories, toVectorLiteral } from "./vector.js";

export class CockroachMemoryRepository implements MemoryRepository {
  constructor(private readonly pool: Pool) {}

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
}
