import { performance } from "node:perf_hooks";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import pg from "pg";
import {
  BedrockConversationAnalyzer,
  BedrockEmbeddingProvider,
  DEFAULT_EMBEDDING_MODEL_ID,
} from "../packages/bedrock/dist/index.js";
import { AnalyzeConversation } from "../packages/core/dist/index.js";
import { CockroachMemoryRepository } from "../packages/database/dist/index.js";

const shouldApply = process.argv.includes("--apply");
const connectionString = process.env.DATABASE_URL?.trim();
const region = process.env.AWS_REGION?.trim() || "ap-southeast-1";
const awsProfile = process.env.AWS_PROFILE?.trim();
const chatModelId = process.env.BEDROCK_CHAT_MODEL_ID?.trim();
const embeddingModelId =
  process.env.BEDROCK_EMBEDDING_MODEL_ID?.trim() ||
  DEFAULT_EMBEDDING_MODEL_ID;

const projectId = "10000000-0000-4000-8000-000000000002";
const priorMemoryId = "10000000-0000-4000-8000-000000000004";
const idempotencyKey = "live-nova-agent-memory-conflict-v1";
const conversationText =
  "Client: Please add an online booking button to every page for the launch.";

if (!shouldApply) {
  console.error(
    "Live Bedrock calls and database changes were not run. Re-run with --apply after reviewing the agent-memory E2E.",
  );
  process.exitCode = 1;
} else if (!connectionString) {
  console.error("DATABASE_URL is empty in .env.local.");
  process.exitCode = 1;
} else if (!awsProfile) {
  console.error(
    "AWS_PROFILE is empty. Set it to scopethread-dev before running live E2E.",
  );
  process.exitCode = 1;
} else if (!chatModelId) {
  console.error("BEDROCK_CHAT_MODEL_ID is empty in .env.local.");
  process.exitCode = 1;
} else {
  const startedAt = performance.now();
  const sts = new STSClient({ region });
  const bedrock = new BedrockRuntimeClient({ region });
  const pool = new pg.Pool({
    connectionString,
    max: 2,
    connectionTimeoutMillis: 10_000,
    ssl: { rejectUnauthorized: true },
  });

  try {
    const identity = await sts.send(new GetCallerIdentityCommand({}));
    if (!identity.Arn?.endsWith(":user/scopethread-dev")) {
      throw new Error(
        "Live E2E requires the scopethread-dev IAM user and refuses root or another AWS identity.",
      );
    }

    const priorMemoryResult = await pool.query(
      `SELECT status, content, embedding IS NOT NULL AS has_embedding
       FROM memory_items
       WHERE id = $1 AND project_id = $2`,
      [priorMemoryId, projectId],
    );
    const priorMemory = priorMemoryResult.rows[0];
    if (
      priorMemoryResult.rowCount !== 1 ||
      priorMemory.status !== "active" ||
      priorMemory.has_embedding !== true
    ) {
      throw new Error(
        "The active seeded decision with a live embedding was not found.",
      );
    }

    const useCase = new AnalyzeConversation(
      new CockroachMemoryRepository(pool),
      new BedrockConversationAnalyzer(bedrock, chatModelId),
      new BedrockEmbeddingProvider(bedrock, embeddingModelId),
      { chatModelId, embeddingModelId },
    );
    const outcome = await useCase.execute({
      projectId,
      conversationText,
      idempotencyKey,
    });
    const { result } = outcome;

    const expectedConflict = result.conflicts.find(
      (conflict) => conflict.priorMemoryId === priorMemoryId,
    );
    if (!expectedConflict) {
      throw new Error(
        "Nova did not ground the booking conflict in the expected prior decision.",
      );
    }
    if (!result.retrievedEvidenceIds.includes(priorMemoryId)) {
      throw new Error("Nova omitted the expected decision from its evidence IDs.");
    }
    if (result.nextQuestions.length === 0) {
      throw new Error("Nova returned no next question for the client.");
    }

    const persistenceResult = await pool.query(
      `SELECT
         c.id AS conversation_id,
         COUNT(DISTINCT m.id)::INT AS memory_count,
         COUNT(DISTINCT l.id)::INT AS conflict_link_count,
         bool_and(m.embedding IS NOT NULL) AS all_memories_embedded
       FROM conversations AS c
       JOIN memory_items AS m ON m.source_conversation_id = c.id
       LEFT JOIN memory_links AS l
         ON l.from_memory_id = m.id
        AND l.to_memory_id = $3
        AND l.relation = 'conflicts_with'
       WHERE c.project_id = $1 AND c.idempotency_key = $2
       GROUP BY c.id`,
      [projectId, idempotencyKey, priorMemoryId],
    );
    const persisted = persistenceResult.rows[0];
    if (
      persistenceResult.rowCount !== 1 ||
      persisted.memory_count < 1 ||
      persisted.conflict_link_count < 1 ||
      persisted.all_memories_embedded !== true
    ) {
      throw new Error(
        "The conversation, embedded memory, and conflict link were not persisted together.",
      );
    }

    const retainedPriorMemory = await pool.query(
      `SELECT status, content
       FROM memory_items
       WHERE id = $1 AND project_id = $2`,
      [priorMemoryId, projectId],
    );
    if (
      retainedPriorMemory.rows[0]?.status !== "active" ||
      retainedPriorMemory.rows[0]?.content !== priorMemory.content
    ) {
      throw new Error("The prior decision changed during conflict analysis.");
    }

    console.log("Bedrock and CockroachDB agent-memory E2E succeeded.");
    console.log(`AWS region: ${region}`);
    console.log(`AWS profile: ${awsProfile}`);
    console.log(`Chat model: ${chatModelId}`);
    console.log(`Embedding model: ${embeddingModelId}`);
    console.log(`Agent run ID: ${outcome.runId}`);
    console.log(`New conversation persisted: ${outcome.persisted}`);
    console.log(`Retrieved evidence IDs: ${result.retrievedEvidenceIds.length}`);
    console.log(`Detected conflicts: ${result.conflicts.length}`);
    console.log(`Persisted memories: ${persisted.memory_count}`);
    console.log(`Next question: ${result.nextQuestions[0]}`);
    console.log(`Duration ms: ${Math.round(performance.now() - startedAt)}`);
  } catch (error) {
    const name = error instanceof Error ? error.name : "UnknownError";
    const message =
      error instanceof Error ? error.message : "Unknown agent-memory E2E error";
    console.error(`Agent-memory E2E failed (${name}): ${message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
    sts.destroy();
    bedrock.destroy();
  }
}
