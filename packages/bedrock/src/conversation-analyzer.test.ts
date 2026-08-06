import { describe, expect, it, vi } from "vitest";
import type { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import type { StoredMemory } from "@scopethread/core";
import { BedrockConversationAnalyzer } from "./conversation-analyzer.js";

const projectId = "10000000-0000-4000-8000-000000000002";
const conversationId = "10000000-0000-4000-8000-000000000003";
const priorMemoryId = "10000000-0000-4000-8000-000000000004";
const unknownMemoryId = "20000000-0000-4000-8000-000000000004";
const newStatement = "Add an online booking button to every page.";

const priorMemory: StoredMemory = {
  id: priorMemoryId,
  projectId,
  sourceConversationId: conversationId,
  kind: "decision",
  status: "active",
  content: "Do not include online booking in the launch scope.",
  rationale: "Phone booking is sufficient for launch.",
  createdAt: "2026-08-04T00:00:00.000Z",
};

function modelResult(overrides: Record<string, unknown> = {}) {
  return {
    summary: "The new request conflicts with an active booking decision.",
    extractedMemories: [
      {
        kind: "requirement",
        status: "proposed",
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
        explanation: "The launch scope previously excluded online booking.",
        confirmationQuestion:
          "Should the earlier no-booking decision be superseded?",
      },
    ],
    nextQuestions: ["Should the earlier no-booking decision be superseded?"],
    retrievedEvidenceIds: [priorMemoryId],
    ...overrides,
  };
}

function analyzerFor(result: unknown) {
  const send = vi.fn().mockResolvedValue({
    output: { message: { content: [{ text: JSON.stringify(result) }] } },
  });
  return {
    analyzer: new BedrockConversationAnalyzer(
      { send } as unknown as BedrockRuntimeClient,
      "global.amazon.nova-2-lite-v1:0",
    ),
    send,
  };
}

const context = {
  request: {
    projectId,
    conversationText: newStatement,
    idempotencyKey: "conversation-analyzer-test-001",
  },
  retrievedMemories: [priorMemory],
};

describe("BedrockConversationAnalyzer", () => {
  it("returns a schema-valid conflict grounded in retrieved memory", async () => {
    const { analyzer, send } = analyzerFor(modelResult());

    const result = await analyzer.analyze(context);

    expect(result.conflicts[0]?.priorMemoryId).toBe(priorMemoryId);
    const commandInput = send.mock.calls[0]?.[0]?.input;
    expect(commandInput.modelId).toBe("global.amazon.nova-2-lite-v1:0");
    expect(commandInput.inferenceConfig).toMatchObject({
      maxTokens: 1800,
      temperature: 0,
    });
    expect(JSON.parse(commandInput.messages[0].content[0].text)).toEqual({
      conversation: newStatement,
      retrievedMemories: [priorMemory],
    });
  });

  it("rejects a conflict that cites memory outside retrieved evidence", async () => {
    const { analyzer } = analyzerFor(
      modelResult({
        conflicts: [
          {
            priorMemoryId: unknownMemoryId,
            newStatement,
            explanation: "Unsupported conflict.",
            confirmationQuestion: "Should this change?",
          },
        ],
        retrievedEvidenceIds: [unknownMemoryId],
      }),
    );

    await expect(analyzer.analyze(context)).rejects.toThrow(
      "unknown retrieved evidence ID",
    );
  });

  it("rejects a conflict that cannot link to an extracted memory", async () => {
    const { analyzer } = analyzerFor(
      modelResult({
        conflicts: [
          {
            priorMemoryId,
            newStatement: "A model-generated statement with no source memory.",
            explanation: "Unlinkable conflict.",
            confirmationQuestion: "Should this change?",
          },
        ],
      }),
    );

    await expect(analyzer.analyze(context)).rejects.toThrow(
      "cannot be linked to an extracted memory",
    );
  });
});
