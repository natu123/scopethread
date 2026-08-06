import type { Pool } from "pg";
import { StoredMemorySchema, type StoredMemory } from "@scopethread/core";

export function toVectorLiteral(values: number[]): string {
  if (values.length !== 1024 || values.some((value) => !Number.isFinite(value))) {
    throw new Error("Expected 1024 finite embedding values.");
  }
  return `[${values.join(",")}]`;
}

export async function retrieveSimilarMemories(input: {
  pool: Pool;
  projectId: string;
  embedding: number[];
  limit?: number;
}): Promise<StoredMemory[]> {
  const limit = Math.min(Math.max(input.limit ?? 8, 1), 20);
  const result = await input.pool.query(
    `SELECT
       id,
       project_id AS "projectId",
       source_conversation_id AS "sourceConversationId",
       kind,
       status,
       content,
       rationale,
       created_at AS "createdAt"
     FROM memory_items
     WHERE project_id = $1
       AND embedding IS NOT NULL
     ORDER BY embedding <=> $2::VECTOR
     LIMIT $3`,
    [input.projectId, toVectorLiteral(input.embedding), limit],
  );

  return result.rows.map((row) =>
    StoredMemorySchema.parse({
      ...row,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : row.createdAt,
    }),
  );
}
