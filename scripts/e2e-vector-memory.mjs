import { performance } from "node:perf_hooks";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import pg from "pg";
import {
  createEmbedding,
  DEFAULT_EMBEDDING_MODEL_ID,
  EMBEDDING_DIMENSIONS,
} from "../packages/bedrock/dist/embedding.js";

const shouldApply = process.argv.includes("--apply");
const connectionString = process.env.DATABASE_URL?.trim();
const region = process.env.AWS_REGION?.trim() || "ap-southeast-1";
const awsProfile = process.env.AWS_PROFILE?.trim();
const modelId =
  process.env.BEDROCK_EMBEDDING_MODEL_ID?.trim() ||
  DEFAULT_EMBEDDING_MODEL_ID;
const projectId = "10000000-0000-4000-8000-000000000002";
const conversationId = "10000000-0000-4000-8000-000000000003";
const memoryId = "10000000-0000-4000-8000-000000000004";
const documentText =
  "Do not include online booking in the launch scope. Phone booking is sufficient for launch.";
const conflictQuery = "Add an online booking button to every page.";

function toVectorLiteral(values) {
  if (
    values.length !== EMBEDDING_DIMENSIONS ||
    values.some((value) => !Number.isFinite(value))
  ) {
    throw new Error(`Expected ${EMBEDDING_DIMENSIONS} finite embedding values.`);
  }
  return `[${values.join(",")}]`;
}

if (!shouldApply) {
  console.error(
    "Live Bedrock calls and database update were not run. Re-run with --apply after AWS authentication is ready.",
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
} else {
  const startedAt = performance.now();
  const sts = new STSClient({ region });
  const bedrock = new BedrockRuntimeClient({ region });
  const pool = new pg.Pool({
    connectionString,
    max: 1,
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

    const documentEmbedding = await createEmbedding({
      client: bedrock,
      text: documentText,
      inputType: "search_document",
      modelId,
    });
    const queryEmbedding = await createEmbedding({
      client: bedrock,
      text: conflictQuery,
      inputType: "search_query",
      modelId,
    });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const updateResult = await client.query(
        `
          UPDATE memory_items
          SET embedding = $2::VECTOR, updated_at = now()
          WHERE id = $1 AND project_id = $3
          RETURNING id
        `,
        [memoryId, toVectorLiteral(documentEmbedding), projectId],
      );
      if (updateResult.rowCount !== 1) {
        throw new Error("The seeded demo memory was not found.");
      }

      await client.query(
        `
          INSERT INTO agent_runs (
            project_id,
            conversation_id,
            status,
            embedding_model_id,
            duration_ms
          )
          VALUES ($1, $2, 'succeeded', $3, $4)
        `,
        [
          projectId,
          conversationId,
          modelId,
          Math.round(performance.now() - startedAt),
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    const searchResult = await pool.query(
      `
        SELECT
          id,
          content,
          embedding <=> $2::VECTOR AS cosine_distance
        FROM memory_items
        WHERE project_id = $1 AND embedding IS NOT NULL
        ORDER BY embedding <=> $2::VECTOR
        LIMIT 3
      `,
      [projectId, toVectorLiteral(queryEmbedding)],
    );
    const topMatch = searchResult.rows[0];

    if (topMatch?.id !== memoryId) {
      throw new Error("Vector search did not retrieve the expected prior decision.");
    }

    console.log("Bedrock and CockroachDB vector-memory E2E succeeded.");
    console.log(`AWS region: ${region}`);
    console.log(`AWS profile: ${awsProfile}`);
    console.log(`Embedding model: ${modelId}`);
    console.log(`Embedding dimensions: ${documentEmbedding.length}`);
    console.log(`Retrieved memory: ${topMatch.content}`);
    console.log(`Cosine distance: ${Number(topMatch.cosine_distance).toFixed(6)}`);
  } catch (error) {
    const name = error instanceof Error ? error.name : "UnknownError";
    const message = error instanceof Error ? error.message : "Unknown E2E error";
    console.error(`Vector-memory E2E failed (${name}): ${message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
    sts.destroy();
    bedrock.destroy();
  }
}
