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
  return analyzerForResponses([JSON.stringify(result)]);
}

function analyzerForResponses(texts: string[]) {
  const fallbackText = texts.at(-1) ?? "";
  const send = vi.fn().mockResolvedValue({
    output: { message: { content: [{ text: fallbackText }] } },
  });
  for (const text of texts) {
    send.mockResolvedValueOnce({
      output: { message: { content: [{ text }] } },
    });
  }
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
      responseLocale: "en",
      retrievedMemories: [priorMemory],
    });
    expect(commandInput.system[0].text).toContain(
      "Write summary, content, rationale, explanation, confirmationQuestion, and nextQuestions in English.",
    );
  });

  it("requests natural Japanese output while preserving source quotes", async () => {
    const { analyzer, send } = analyzerFor(modelResult());

    await analyzer.analyze({
      ...context,
      request: { ...context.request, locale: "ja" },
    });

    const commandInput = send.mock.calls[0]?.[0]?.input;
    expect(commandInput.system[0].text).toContain(
      "Write summary, content, rationale, explanation, confirmationQuestion, and nextQuestions in natural Japanese.",
    );
    expect(JSON.parse(commandInput.messages[0].content[0].text)).toMatchObject({
      responseLocale: "ja",
    });
  });

  it.each([
    ["a fenced object", (json: string) => `\u0060\u0060\u0060json\n${json}\n\u0060\u0060\u0060`],
    ["an object with surrounding prose", (json: string) => `Result follows:\n${json}\nDone.`],
  ])("accepts %s without a paid retry", async (_label, wrap) => {
    const { analyzer, send } = analyzerForResponses([
      wrap(JSON.stringify(modelResult())),
    ]);

    const result = await analyzer.analyze(context);

    expect(result.conflicts[0]?.priorMemoryId).toBe(priorMemoryId);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("retries once with a stricter repair request after invalid output", async () => {
    const { analyzer, send } = analyzerForResponses([
      "This is not JSON.",
      JSON.stringify(modelResult()),
    ]);

    const result = await analyzer.analyze(context);

    expect(result.conflicts[0]?.priorMemoryId).toBe(priorMemoryId);
    expect(send).toHaveBeenCalledTimes(2);
    const repairInput = send.mock.calls[1]?.[0]?.input;
    expect(repairInput.inferenceConfig.maxTokens).toBe(2400);
    expect(repairInput.system[0].text).toContain(
      "Return syntactically valid JSON with double-quoted keys and strings",
    );
    expect(JSON.parse(repairInput.messages[0].content[0].text)).toMatchObject({
      repairAttempt: true,
    });
  });

  it("links a single grounded memory without a paid repair retry", async () => {
    const unlinked = modelResult({
      conflicts: [
        {
          priorMemoryId,
          newStatement: "A paraphrase that is not stored evidence.",
          explanation: "Unlinkable conflict.",
          confirmationQuestion: "Should this change?",
        },
      ],
    });
    const { analyzer, send } = analyzerFor(unlinked);

    const result = await analyzer.analyze(context);

    expect(result.conflicts[0]?.newStatement).toBe(newStatement);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("repairs a source quote that is not present in the conversation", async () => {
    const ungrounded = modelResult();
    ungrounded.extractedMemories[0]!.sourceQuote =
      "A quote that was never supplied by the client.";
    const { analyzer, send } = analyzerForResponses([
      JSON.stringify(ungrounded),
      JSON.stringify(modelResult()),
    ]);

    const result = await analyzer.analyze(context);

    expect(result.extractedMemories[0]?.sourceQuote).toBe(newStatement);
    expect(send.mock.calls[1]?.[0]?.input.system[0].text).toContain(
      "copy sourceQuote exactly from a contiguous substring",
    );
  });

  it("repairs omitted conflict evidence with inclusion guidance", async () => {
    const { analyzer, send } = analyzerForResponses([
      JSON.stringify(modelResult({ retrievedEvidenceIds: [] })),
      JSON.stringify(modelResult()),
    ]);

    await analyzer.analyze(context);

    expect(send.mock.calls[1]?.[0]?.input.system[0].text).toContain(
      "include its priorMemoryId unchanged in retrievedEvidenceIds",
    );
  });

  it("repairs a schema mismatch with required-field guidance", async () => {
    const invalidSchema = modelResult();
    delete (invalidSchema as { summary?: string }).summary;
    const { analyzer, send } = analyzerForResponses([
      JSON.stringify(invalidSchema),
      JSON.stringify(modelResult()),
    ]);

    await analyzer.analyze(context);

    expect(send.mock.calls[1]?.[0]?.input.system[0].text).toContain(
      "Return every required field with exactly the documented key names",
    );
  });

  it("stops after one repair attempt when output remains invalid", async () => {
    const { analyzer, send } = analyzerForResponses([
      "invalid first response",
      "invalid repair response",
    ]);

    await expect(analyzer.analyze(context)).rejects.toThrow(
      "invalid JSON syntax",
    );
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("rejects a conflict that cites memory outside retrieved evidence", async () => {
    const { analyzer, send } = analyzerFor(
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
    const repairPrompt = send.mock.calls[1]?.[0]?.input.system[0].text;
    expect(repairPrompt).toContain(
      "Use only evidence UUIDs copied exactly from retrievedMemories",
    );
    expect(repairPrompt).not.toContain(unknownMemoryId);
  });

  it("rejects a conflict that cannot link to an extracted memory", async () => {
    const secondStatement = "Keep the existing contact form.";
    const ambiguous = modelResult({
      extractedMemories: [
        ...modelResult().extractedMemories,
        {
          kind: "decision",
          status: "active",
          content: secondStatement,
          rationale: null,
          sourceQuote: secondStatement,
          confidence: 0.9,
        },
      ],
      conflicts: [
        {
          priorMemoryId,
          newStatement: "A model-generated statement with no source memory.",
          explanation: "Unlinkable conflict.",
          confirmationQuestion: "Should this change?",
        },
      ],
    });
    const { analyzer, send } = analyzerFor(ambiguous);

    await expect(
      analyzer.analyze({
        ...context,
        request: {
          ...context.request,
          conversationText: `${newStatement} ${secondStatement}`,
        },
      }),
    ).rejects.toThrow("cannot be linked to an extracted memory");
    expect(send.mock.calls[1]?.[0]?.input.system[0].text).toContain(
      "copy conflict.newStatement exactly from one extracted memory content or sourceQuote",
    );
  });
});
