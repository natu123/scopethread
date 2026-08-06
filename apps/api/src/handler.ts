import { performance } from "node:perf_hooks";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import {
  BedrockConversationAnalyzer,
  BedrockEmbeddingProvider,
  DEFAULT_EMBEDDING_MODEL_ID,
} from "@scopethread/bedrock";
import {
  AnalyzeConversation,
  AnalyzeConversationError,
  AnalyzeConversationRequestSchema,
} from "@scopethread/core";
import { CockroachMemoryRepository, getPool } from "@scopethread/database";

class ConfigurationError extends Error {
  override readonly name = "ConfigurationError";
}

let useCasePromise: Promise<AnalyzeConversation> | undefined;

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

async function loadDatabaseUrl(): Promise<string> {
  const localConnectionString = process.env.DATABASE_URL?.trim();
  if (localConnectionString) {
    return localConnectionString;
  }

  const parameterName = process.env.DATABASE_URL_PARAMETER_NAME?.trim();
  if (!parameterName) {
    throw new ConfigurationError(
      "DATABASE_URL or DATABASE_URL_PARAMETER_NAME is not configured.",
    );
  }

  const ssm = new SSMClient({
    region: process.env.AWS_REGION || "ap-southeast-1",
  });
  try {
    const response = await ssm.send(
      new GetParameterCommand({ Name: parameterName, WithDecryption: true }),
    );
    const connectionString = response.Parameter?.Value?.trim();
    if (!connectionString) {
      throw new ConfigurationError("The database URL parameter is empty.");
    }
    return connectionString;
  } finally {
    ssm.destroy();
  }
}

async function createUseCase(): Promise<AnalyzeConversation> {
  const connectionString = await loadDatabaseUrl();
  const chatModelId = process.env.BEDROCK_CHAT_MODEL_ID?.trim();
  const embeddingModelId =
    process.env.BEDROCK_EMBEDDING_MODEL_ID?.trim() ||
    DEFAULT_EMBEDDING_MODEL_ID;

  if (!chatModelId) {
    throw new ConfigurationError("BEDROCK_CHAT_MODEL_ID is not configured.");
  }

  const bedrock = new BedrockRuntimeClient({
    region: process.env.AWS_REGION || "ap-southeast-1",
  });
  return new AnalyzeConversation(
    new CockroachMemoryRepository(getPool(connectionString)),
    new BedrockConversationAnalyzer(bedrock, chatModelId),
    new BedrockEmbeddingProvider(bedrock, embeddingModelId),
    { chatModelId, embeddingModelId },
  );
}

function getUseCase(): Promise<AnalyzeConversation> {
  useCasePromise ??= createUseCase().catch((error: unknown) => {
    useCasePromise = undefined;
    throw error;
  });
  return useCasePromise;
}

function isRequestError(error: unknown): boolean {
  return (
    error instanceof SyntaxError ||
    (error instanceof Error && error.name === "ZodError")
  );
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  const path = event.rawPath;

  if (method === "GET" && path === "/health") {
    const databaseConfigured = Boolean(
      process.env.DATABASE_URL?.trim() ||
        process.env.DATABASE_URL_PARAMETER_NAME?.trim(),
    );
    const chatModelConfigured = Boolean(
      process.env.BEDROCK_CHAT_MODEL_ID?.trim(),
    );

    return json(200, {
      service: "scopethread-api",
      status:
        databaseConfigured && chatModelConfigured
          ? "ready"
          : "configuration-required",
      stage: "agentic-memory",
      persistenceConfigured: databaseConfigured,
      bedrockConfigured: chatModelConfigured,
    });
  }

  if (method === "POST" && path === "/analyze") {
    const startedAt = performance.now();
    const requestId = event.requestContext.requestId;

    try {
      const request = AnalyzeConversationRequestSchema.parse(
        JSON.parse(event.body ?? "{}"),
      );
      const outcome = await (await getUseCase()).execute(request);

      console.info(
        JSON.stringify({
          event: "analysis_succeeded",
          requestId,
          runId: outcome.runId,
          projectId: request.projectId,
          chatModelId: process.env.BEDROCK_CHAT_MODEL_ID,
          embeddingModelId:
            process.env.BEDROCK_EMBEDDING_MODEL_ID ||
            DEFAULT_EMBEDDING_MODEL_ID,
          persisted: outcome.persisted,
          durationMs: Math.round(performance.now() - startedAt),
        }),
      );
      return json(200, {
        mode: "agentic-memory",
        runId: outcome.runId,
        persisted: outcome.persisted,
        result: outcome.result,
      });
    } catch (error) {
      if (isRequestError(error)) {
        return json(400, {
          error: "INVALID_REQUEST",
          message: "The request body is invalid.",
        });
      }
      if (error instanceof ConfigurationError) {
        return json(503, {
          error: "SERVICE_NOT_CONFIGURED",
          message: error.message,
        });
      }

      console.error(
        JSON.stringify({
          event: "analysis_failed",
          requestId,
          runId:
            error instanceof AnalyzeConversationError
              ? error.runId
              : undefined,
          category:
            error instanceof AnalyzeConversationError
              ? error.errorCode
              : error instanceof Error
                ? error.name
                : "UnknownError",
          chatModelId: process.env.BEDROCK_CHAT_MODEL_ID,
          embeddingModelId:
            process.env.BEDROCK_EMBEDDING_MODEL_ID ||
            DEFAULT_EMBEDDING_MODEL_ID,
          durationMs: Math.round(performance.now() - startedAt),
        }),
      );
      return json(502, {
        error: "ANALYSIS_FAILED",
        message: "The agent could not analyze this conversation.",
        ...(error instanceof AnalyzeConversationError
          ? { runId: error.runId }
          : {}),
      });
    }
  }

  return json(404, { error: "NOT_FOUND" });
}
