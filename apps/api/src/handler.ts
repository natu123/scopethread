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
  ConfirmRevision,
  ConfirmRevisionError,
  ConfirmRevisionRequestSchema,
} from "@scopethread/core";
import { CockroachMemoryRepository, getPool } from "@scopethread/database";

class ConfigurationError extends Error {
  override readonly name = "ConfigurationError";
}

let repositoryPromise: Promise<CockroachMemoryRepository> | undefined;
let analyzeUseCasePromise: Promise<AnalyzeConversation> | undefined;
let revisionUseCasePromise: Promise<ConfirmRevision> | undefined;

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

async function createRepository(): Promise<CockroachMemoryRepository> {
  const connectionString = await loadDatabaseUrl();
  return new CockroachMemoryRepository(getPool(connectionString));
}

function getRepository(): Promise<CockroachMemoryRepository> {
  repositoryPromise ??= createRepository().catch((error: unknown) => {
    repositoryPromise = undefined;
    throw error;
  });
  return repositoryPromise;
}

async function createAnalyzeUseCase(): Promise<AnalyzeConversation> {
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
    await getRepository(),
    new BedrockConversationAnalyzer(bedrock, chatModelId),
    new BedrockEmbeddingProvider(bedrock, embeddingModelId),
    { chatModelId, embeddingModelId },
  );
}

function getAnalyzeUseCase(): Promise<AnalyzeConversation> {
  analyzeUseCasePromise ??= createAnalyzeUseCase().catch((error: unknown) => {
    analyzeUseCasePromise = undefined;
    throw error;
  });
  return analyzeUseCasePromise;
}

function getRevisionUseCase(): Promise<ConfirmRevision> {
  revisionUseCasePromise ??= getRepository()
    .then((repository) => new ConfirmRevision(repository))
    .catch((error: unknown) => {
      revisionUseCasePromise = undefined;
      throw error;
    });
  return revisionUseCasePromise;
}

function isRequestError(error: unknown): boolean {
  return (
    error instanceof SyntaxError ||
    (error instanceof Error && error.name === "ZodError")
  );
}

export type HandlerDependencies = {
  getAnalyzeUseCase: () => Promise<Pick<AnalyzeConversation, "execute">>;
  getRevisionUseCase: () => Promise<Pick<ConfirmRevision, "execute">>;
};

const defaultDependencies: HandlerDependencies = {
  getAnalyzeUseCase,
  getRevisionUseCase,
};

async function handleRequest(
  event: APIGatewayProxyEventV2,
  dependencies: HandlerDependencies,
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
      const outcome = await (await dependencies.getAnalyzeUseCase()).execute(
        request,
      );

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

  if (method === "POST" && path === "/revisions") {
    const startedAt = performance.now();
    const requestId = event.requestContext.requestId;

    try {
      const request = ConfirmRevisionRequestSchema.parse(
        JSON.parse(event.body ?? "{}"),
      );
      const outcome = await (
        await dependencies.getRevisionUseCase()
      ).execute(request);

      console.info(
        JSON.stringify({
          event: "revision_confirmed",
          requestId,
          projectId: request.projectId,
          agentRunId: request.agentRunId,
          priorMemoryId: outcome.priorMemoryId,
          replacementMemoryId: outcome.replacementMemoryId,
          changed: outcome.changed,
          durationMs: Math.round(performance.now() - startedAt),
        }),
      );
      return json(200, {
        mode: "revision-confirmed",
        ...outcome,
      });
    } catch (error) {
      if (isRequestError(error)) {
        return json(400, {
          error: "INVALID_REQUEST",
          message: "The revision request body is invalid.",
        });
      }
      if (error instanceof ConfigurationError) {
        return json(503, {
          error: "SERVICE_NOT_CONFIGURED",
          message: error.message,
        });
      }
      if (error instanceof ConfirmRevisionError) {
        const notFound = error.code === "REVISION_NOT_FOUND";
        return json(notFound ? 404 : 409, {
          error: error.code,
          message: notFound
            ? "The stored conflict proposal was not found."
            : "The decision can no longer be revised from this proposal.",
        });
      }

      console.error(
        JSON.stringify({
          event: "revision_failed",
          requestId,
          category: error instanceof Error ? error.name : "UnknownError",
          durationMs: Math.round(performance.now() - startedAt),
        }),
      );
      return json(502, {
        error: "REVISION_FAILED",
        message: "The decision revision could not be saved.",
      });
    }
  }

  return json(404, { error: "NOT_FOUND" });
}

export function createHandler(
  dependencies: HandlerDependencies = defaultDependencies,
) {
  return (event: APIGatewayProxyEventV2) => handleRequest(event, dependencies);
}

export const handler = createHandler();
