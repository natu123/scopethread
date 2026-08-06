import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { ConfirmRevisionError, type RevisionOutcome } from "@scopethread/core";
import { createHandler, handler, type HandlerDependencies } from "./handler";

function event(method: string, rawPath: string, body?: string) {
  return {
    rawPath,
    body,
    requestContext: {
      requestId: "test-request-id",
      http: { method },
    },
  } as APIGatewayProxyEventV2;
}

async function invoke(
  input: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  return (await handler(input)) as APIGatewayProxyStructuredResultV2;
}

function handlerWithRevision(
  execute: (input: unknown) => Promise<RevisionOutcome>,
) {
  const dependencies: HandlerDependencies = {
    getAnalyzeUseCase: async () => ({
      execute: async () => {
        throw new Error("Analyze was not expected in this test.");
      },
    }),
    getRevisionUseCase: async () => ({ execute }),
  };
  return createHandler(dependencies);
}

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalDatabaseParameterName = process.env.DATABASE_URL_PARAMETER_NAME;
const originalChatModelId = process.env.BEDROCK_CHAT_MODEL_ID;

afterEach(() => {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
  if (originalDatabaseParameterName === undefined) {
    delete process.env.DATABASE_URL_PARAMETER_NAME;
  } else {
    process.env.DATABASE_URL_PARAMETER_NAME = originalDatabaseParameterName;
  }
  if (originalChatModelId === undefined) {
    delete process.env.BEDROCK_CHAT_MODEL_ID;
    delete process.env.DATABASE_URL_PARAMETER_NAME;
  } else {
    process.env.BEDROCK_CHAT_MODEL_ID = originalChatModelId;
  }
});

describe("API handler", () => {
  it("reports configuration state without exposing secrets", async () => {
    process.env.DATABASE_URL = "postgresql://secret-value";
    delete process.env.BEDROCK_CHAT_MODEL_ID;

    const response = await invoke(event("GET", "/health"));
    const body = JSON.parse(response.body ?? "{}");

    expect(response.statusCode).toBe(200);
    expect(body).toEqual({
      service: "scopethread-api",
      status: "configuration-required",
      stage: "agentic-memory",
      persistenceConfigured: true,
      bedrockConfigured: false,
    });
    expect(response.body).not.toContain("secret-value");
  });

  it("rejects malformed analyze input", async () => {
    const response = await invoke(event("POST", "/analyze", "{}"));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body ?? "{}").error).toBe("INVALID_REQUEST");
  });

  it("returns a configuration error before external calls", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_URL_PARAMETER_NAME;
    delete process.env.BEDROCK_CHAT_MODEL_ID;

    const response = await invoke(
      event(
        "POST",
        "/analyze",
        JSON.stringify({
          projectId: "10000000-0000-4000-8000-000000000002",
          conversationText: "Add a booking button to every page.",
          idempotencyKey: "handler-test-request-001",
        }),
      ),
    );

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body ?? "{}").error).toBe(
      "SERVICE_NOT_CONFIGURED",
    );
  });

  it("confirms a stored conflict proposal through the revision endpoint", async () => {
    const execute = vi.fn().mockResolvedValue({
      priorMemoryId: "10000000-0000-4000-8000-000000000004",
      replacementMemoryId: "10000000-0000-4000-8000-000000000006",
      reason: "The client approved booking for the revised launch scope.",
      revisedAt: "2026-08-06T03:00:00.000Z",
      changed: true,
    });
    const revisionHandler = handlerWithRevision(execute);
    const body = {
      projectId: "10000000-0000-4000-8000-000000000002",
      agentRunId: "10000000-0000-4000-8000-000000000005",
      priorMemoryId: "10000000-0000-4000-8000-000000000004",
      reason: "The client approved booking for the revised launch scope.",
    };

    const response = (await revisionHandler(
      event("POST", "/revisions", JSON.stringify(body)),
    )) as APIGatewayProxyStructuredResultV2;
    const payload = JSON.parse(response.body ?? "{}");

    expect(response.statusCode).toBe(200);
    expect(payload).toMatchObject({
      mode: "revision-confirmed",
      changed: true,
      priorMemoryId: body.priorMemoryId,
    });
    expect(execute).toHaveBeenCalledWith(body);
  });

  it.each([
    ["REVISION_NOT_FOUND", 404],
    ["REVISION_STATE_CONFLICT", 409],
  ] as const)("maps %s to HTTP %i", async (code, statusCode) => {
    const revisionHandler = handlerWithRevision(async () => {
      throw new ConfirmRevisionError(code);
    });

    const response = (await revisionHandler(
      event(
        "POST",
        "/revisions",
        JSON.stringify({
          projectId: "10000000-0000-4000-8000-000000000002",
          agentRunId: "10000000-0000-4000-8000-000000000005",
          priorMemoryId: "10000000-0000-4000-8000-000000000004",
          reason: "The project direction changed.",
        }),
      ),
    )) as APIGatewayProxyStructuredResultV2;

    expect(response.statusCode).toBe(statusCode);
    expect(JSON.parse(response.body ?? "{}").error).toBe(code);
  });
});
