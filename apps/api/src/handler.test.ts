import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import {
  AnalyzeConversationError,
  ConfirmRevisionError,
  DismissConflictError,
  type ConflictDismissalOutcome,
  type RevisionOutcome,
} from "@scopethread/core";
import { createHandler, handler, type HandlerDependencies } from "./handler";

const demoToken = "a".repeat(43);

const getEmptyMemoryInspectionRepository = async () => ({
  inspectProjectMemory: async () => null,
});

const getUnexpectedDismissalUseCase = async () => ({
  execute: async () => {
    throw new Error("Conflict dismissal was not expected in this test.");
  },
});

function event(method: string, rawPath: string, body?: string) {
  return {
    rawPath,
    body,
    headers: { authorization: `Bearer ${demoToken}` },
    requestContext: {
      requestId: "test-request-id",
      http: { method },
    },
  } as unknown as APIGatewayProxyEventV2;
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
    getDismissalUseCase: getUnexpectedDismissalUseCase,
    getSessionRepository: async () => ({
      createDemoSession: async () => {
        throw new Error("Session creation was not expected in this test.");
      },
      authorizeDemoRequest: async () => ({
        status: "authorized",
        remainingAnalysisRequests: 5,
      }),
    }),
    getMemoryInspectionRepository: getEmptyMemoryInspectionRepository,
  };
  return createHandler(dependencies);
}

function handlerWithDismissal(
  execute: (input: unknown) => Promise<ConflictDismissalOutcome>,
) {
  const dependencies: HandlerDependencies = {
    getAnalyzeUseCase: async () => ({
      execute: async () => {
        throw new Error("Analyze was not expected in this test.");
      },
    }),
    getRevisionUseCase: async () => ({
      execute: async () => {
        throw new Error("Revision was not expected in this test.");
      },
    }),
    getDismissalUseCase: async () => ({ execute }),
    getSessionRepository: async () => ({
      createDemoSession: async () => {
        throw new Error("Session creation was not expected in this test.");
      },
      authorizeDemoRequest: async () => ({
        status: "authorized",
        remainingAnalysisRequests: 5,
      }),
    }),
    getMemoryInspectionRepository: getEmptyMemoryInspectionRepository,
  };
  return createHandler(dependencies);
}

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalDatabaseParameterName = process.env.DATABASE_URL_PARAMETER_NAME;
const originalChatModelId = process.env.BEDROCK_CHAT_MODEL_ID;
const originalTemplateMemoryId = process.env.DEMO_TEMPLATE_MEMORY_ID;

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
  if (originalTemplateMemoryId === undefined) {
    delete process.env.DEMO_TEMPLATE_MEMORY_ID;
  } else {
    process.env.DEMO_TEMPLATE_MEMORY_ID = originalTemplateMemoryId;
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

  it("rejects an oversized request before authorization or model access", async () => {
    const execute = vi.fn();
    const authorizeDemoRequest = vi.fn();
    const dependencies: HandlerDependencies = {
      getAnalyzeUseCase: async () => ({ execute }),
      getRevisionUseCase: async () => ({ execute: vi.fn() }),
      getDismissalUseCase: getUnexpectedDismissalUseCase,
      getSessionRepository: async () => ({
        createDemoSession: vi.fn(),
        authorizeDemoRequest,
      }),
      getMemoryInspectionRepository: getEmptyMemoryInspectionRepository,
    };
    const oversizedBody = JSON.stringify({ content: "あ".repeat(6_000) });

    const response = (await createHandler(dependencies)(
      event("POST", "/analyze", oversizedBody),
    )) as APIGatewayProxyStructuredResultV2;

    expect(response.statusCode).toBe(413);
    expect(JSON.parse(response.body ?? "{}")).toEqual({
      error: "REQUEST_TOO_LARGE",
      message: "The request body exceeds the 16 KiB limit.",
    });
    expect(authorizeDemoRequest).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("requires a demo session before analysis", async () => {
    const input = event(
      "POST",
      "/analyze",
      JSON.stringify({
        projectId: "10000000-0000-4000-8000-000000000002",
        conversationText: "Add a booking button to every page.",
        idempotencyKey: "handler-test-request-session",
      }),
    );
    input.headers = {};

    const response = await invoke(input);

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body ?? "{}").error).toBe(
      "DEMO_SESSION_REQUIRED",
    );
  });

  it("creates a short-lived demo session without returning its token hash", async () => {
    process.env.DEMO_TEMPLATE_MEMORY_ID =
      "10000000-0000-4000-8000-000000000004";
    const createDemoSession = vi.fn().mockResolvedValue({
      sessionId: "20000000-0000-4000-8000-000000000001",
      projectId: "20000000-0000-4000-8000-000000000002",
      projectName: "Aozora Dental Clinic Website",
      initialDecision: {
        id: "20000000-0000-4000-8000-000000000004",
        content: "Do not include online booking in the launch scope.",
        rationale: null,
        sourceQuote: "The website does not need a booking feature.",
      },
      expiresAt: "2026-08-06T08:00:00.000Z",
      maxAnalysisRequests: 6,
    });
    const dependencies: HandlerDependencies = {
      getAnalyzeUseCase: async () => ({
        execute: async () => {
          throw new Error("Analysis was not expected in this test.");
        },
      }),
      getRevisionUseCase: async () => ({
        execute: async () => {
          throw new Error("Revision was not expected in this test.");
        },
      }),
      getDismissalUseCase: getUnexpectedDismissalUseCase,
      getSessionRepository: async () => ({
        createDemoSession,
        authorizeDemoRequest: async () => ({ status: "unauthorized" }),
      }),
      getMemoryInspectionRepository: getEmptyMemoryInspectionRepository,
    };

    const response = (await createHandler(dependencies)(
      event("POST", "/sessions"),
    )) as APIGatewayProxyStructuredResultV2;
    const payload = JSON.parse(response.body ?? "{}");

    expect(response.statusCode).toBe(201);
    expect(payload.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(payload).not.toHaveProperty("tokenHash");
    expect(createDemoSession).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        templateMemoryId: process.env.DEMO_TEMPLATE_MEMORY_ID,
        maxAnalysisRequests: 6,
      }),
    );
  });

  it("rejects analysis after the session allowance is exhausted", async () => {
    const execute = vi.fn();
    const dependencies: HandlerDependencies = {
      getAnalyzeUseCase: async () => ({ execute }),
      getRevisionUseCase: async () => ({ execute: vi.fn() }),
      getDismissalUseCase: getUnexpectedDismissalUseCase,
      getSessionRepository: async () => ({
        createDemoSession: vi.fn(),
        authorizeDemoRequest: async () => ({ status: "rate_limited" }),
      }),
      getMemoryInspectionRepository: getEmptyMemoryInspectionRepository,
    };
    const limitedHandler = createHandler(dependencies);

    const response = (await limitedHandler(
      event(
        "POST",
        "/analyze",
        JSON.stringify({
          projectId: "10000000-0000-4000-8000-000000000002",
          conversationText: "Add a booking button to every page.",
          idempotencyKey: "handler-test-request-limited",
        }),
      ),
    )) as APIGatewayProxyStructuredResultV2;

    expect(response.statusCode).toBe(429);
    expect(JSON.parse(response.body ?? "{}").error).toBe(
      "DEMO_ANALYSIS_LIMIT_REACHED",
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects a token that does not own the requested project", async () => {
    const execute = vi.fn();
    const dependencies: HandlerDependencies = {
      getAnalyzeUseCase: async () => ({ execute }),
      getRevisionUseCase: async () => ({ execute: vi.fn() }),
      getDismissalUseCase: getUnexpectedDismissalUseCase,
      getSessionRepository: async () => ({
        createDemoSession: vi.fn(),
        authorizeDemoRequest: async () => ({ status: "unauthorized" }),
      }),
      getMemoryInspectionRepository: getEmptyMemoryInspectionRepository,
    };

    const response = (await createHandler(dependencies)(
      event(
        "POST",
        "/analyze",
        JSON.stringify({
          projectId: "10000000-0000-4000-8000-000000000099",
          conversationText: "Read another project's decisions.",
          idempotencyKey: "handler-test-cross-project",
        }),
      ),
    )) as APIGatewayProxyStructuredResultV2;

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body ?? "{}").error).toBe(
      "DEMO_SESSION_INVALID",
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("returns authenticated project memory without consuming analysis quota", async () => {
    const inspectProjectMemory = vi.fn().mockResolvedValue({
      projectId: "10000000-0000-4000-8000-000000000002",
      projectName: "Aozora Dental Clinic",
      items: [
        {
          id: "10000000-0000-4000-8000-000000000004",
          projectId: "10000000-0000-4000-8000-000000000002",
          sourceConversationId: "10000000-0000-4000-8000-000000000003",
          kind: "decision",
          status: "active",
          content: "Do not include online booking.",
          rationale: null,
          sourceQuote: "Booking is not needed for launch.",
          createdAt: "2026-08-06T03:00:00.000Z",
        },
      ],
      links: [],
    });
    const authorizeDemoRequest = vi.fn().mockResolvedValue({
      status: "authorized",
      remainingAnalysisRequests: 5,
    });
    const dependencies: HandlerDependencies = {
      getAnalyzeUseCase: async () => ({ execute: vi.fn() }),
      getRevisionUseCase: async () => ({ execute: vi.fn() }),
      getDismissalUseCase: getUnexpectedDismissalUseCase,
      getSessionRepository: async () => ({
        createDemoSession: vi.fn(),
        authorizeDemoRequest,
      }),
      getMemoryInspectionRepository: async () => ({ inspectProjectMemory }),
    };
    const input = event("GET", "/memory");
    input.queryStringParameters = {
      projectId: "10000000-0000-4000-8000-000000000002",
    };

    const response = (await createHandler(dependencies)(
      input,
    )) as APIGatewayProxyStructuredResultV2;
    const payload = JSON.parse(response.body ?? "{}");

    expect(response.statusCode).toBe(200);
    expect(payload).toMatchObject({
      mode: "project-memory",
      projectName: "Aozora Dental Clinic",
    });
    expect(payload.items).toHaveLength(1);
    expect(authorizeDemoRequest).toHaveBeenCalledWith(
      expect.objectContaining({ consumeAnalysisRequest: false }),
    );
    expect(inspectProjectMemory).toHaveBeenCalledWith(
      "10000000-0000-4000-8000-000000000002",
    );
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

  it("returns only the allowlisted analysis category and run ID", async () => {
    const failedRunId = "10000000-0000-4000-8000-000000000005";
    const execute = vi.fn().mockRejectedValue(
      new AnalyzeConversationError(
        failedRunId,
        "MODEL_OUTPUT_UNLINKED_CONFLICT",
        { cause: new Error("Generated conversation content.") },
      ),
    );
    const dependencies: HandlerDependencies = {
      getAnalyzeUseCase: async () => ({ execute }),
      getRevisionUseCase: async () => ({ execute: vi.fn() }),
      getDismissalUseCase: getUnexpectedDismissalUseCase,
      getSessionRepository: async () => ({
        createDemoSession: vi.fn(),
        authorizeDemoRequest: async () => ({
          status: "authorized",
          remainingAnalysisRequests: 5,
        }),
      }),
      getMemoryInspectionRepository: getEmptyMemoryInspectionRepository,
    };

    const response = (await createHandler(dependencies)(
      event(
        "POST",
        "/analyze",
        JSON.stringify({
          projectId: "10000000-0000-4000-8000-000000000002",
          conversationText: "Add a booking button to every page.",
          idempotencyKey: "handler-test-output-category",
        }),
      ),
    )) as APIGatewayProxyStructuredResultV2;
    const payload = JSON.parse(response.body ?? "{}");

    expect(response.statusCode).toBe(502);
    expect(payload).toEqual({
      error: "ANALYSIS_FAILED",
      message: "The agent could not analyze this conversation.",
      runId: failedRunId,
      category: "MODEL_OUTPUT_UNLINKED_CONFLICT",
    });
    expect(response.body).not.toContain("Generated conversation content.");
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

  it("dismisses a stored false-positive conflict", async () => {
    const execute = vi.fn().mockResolvedValue({
      priorMemoryId: "10000000-0000-4000-8000-000000000004",
      dismissedMemoryId: "10000000-0000-4000-8000-000000000006",
      reason: "The request was exploratory and is not approved scope.",
      dismissedAt: "2026-08-06T05:00:00.000Z",
      changed: true,
    });
    const dismissalHandler = handlerWithDismissal(execute);
    const body = {
      projectId: "10000000-0000-4000-8000-000000000002",
      agentRunId: "10000000-0000-4000-8000-000000000005",
      priorMemoryId: "10000000-0000-4000-8000-000000000004",
      reason: "The request was exploratory and is not approved scope.",
    };

    const response = (await dismissalHandler(
      event("POST", "/conflicts/dismiss", JSON.stringify(body)),
    )) as APIGatewayProxyStructuredResultV2;
    const payload = JSON.parse(response.body ?? "{}");

    expect(response.statusCode).toBe(200);
    expect(payload).toMatchObject({
      mode: "conflict-dismissed",
      changed: true,
      priorMemoryId: body.priorMemoryId,
    });
    expect(execute).toHaveBeenCalledWith(body);
  });

  it.each([
    ["CONFLICT_NOT_FOUND", 404],
    ["CONFLICT_STATE_CONFLICT", 409],
  ] as const)("maps %s to HTTP %i", async (code, statusCode) => {
    const dismissalHandler = handlerWithDismissal(async () => {
      throw new DismissConflictError(code);
    });

    const response = (await dismissalHandler(
      event(
        "POST",
        "/conflicts/dismiss",
        JSON.stringify({
          projectId: "10000000-0000-4000-8000-000000000002",
          agentRunId: "10000000-0000-4000-8000-000000000005",
          priorMemoryId: "10000000-0000-4000-8000-000000000004",
          reason: "The request was exploratory.",
        }),
      ),
    )) as APIGatewayProxyStructuredResultV2;

    expect(response.statusCode).toBe(statusCode);
    expect(JSON.parse(response.body ?? "{}").error).toBe(code);
  });
});
