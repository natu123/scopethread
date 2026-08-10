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
        sourceQuoteId: "conversation-quote-1",
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
      conversationEvidence: [
        { id: "conversation-quote-1", quote: newStatement },
      ],
      responseLocale: "en",
      retrievedMemories: [priorMemory],
    });
    expect(commandInput.system[0].text).toContain(
      "Write summary, content, rationale, explanation, confirmationQuestion, and nextQuestions in English.",
    );
    expect(commandInput.system[0].text).toContain(
      "Never restate retrievedMemories as new memories",
    );
  });

  it("requests natural Japanese output while preserving source quotes", async () => {
    const japaneseStatement =
      "顧客は、訪問者が予約を申し込めるように、すべてのページへ予約ボタンを追加したいと希望しています。";
    const japaneseResult = modelResult();
    japaneseResult.extractedMemories[0]!.content = japaneseStatement;
    japaneseResult.conflicts[0]!.newStatement = japaneseStatement;
    const { analyzer, send } = analyzerFor(japaneseResult);

    const result = await analyzer.analyze({
      ...context,
      request: {
        ...context.request,
        conversationText: japaneseStatement,
        locale: "ja",
      },
    });

    const commandInput = send.mock.calls[0]?.[0]?.input;
    expect(commandInput.system[0].text).toContain(
      "Write summary, content, rationale, explanation, confirmationQuestion, and nextQuestions in natural Japanese.",
    );
    expect(JSON.parse(commandInput.messages[0].content[0].text)).toMatchObject({
      responseLocale: "ja",
      conversationEvidence: [
        { id: "conversation-quote-1", quote: japaneseStatement },
      ],
    });
    expect(result.extractedMemories[0]?.sourceQuote).toBe(japaneseStatement);
    expect(result.conflicts[0]).toMatchObject({
      explanation:
        "新しい依頼は、保存済みの有効な決定と異なる方向を示しています。",
      confirmationQuestion:
        "保存済みの決定を変更し、この新しい方向を採用しますか？",
    });
    expect(result.nextQuestions[0]).toBe(
      "保存済みの決定を変更し、この新しい方向を採用しますか？",
    );
  });

  it("normalizes English conflict control copy on the host", async () => {
    const { analyzer } = analyzerFor(modelResult());

    const result = await analyzer.analyze(context);

    expect(result.conflicts[0]).toMatchObject({
      explanation:
        "The new request points in a different direction from the stored active decision.",
      confirmationQuestion:
        "Should the stored decision be changed to adopt this new direction?",
    });
    expect(result.nextQuestions[0]).toBe(
      "Should the stored decision be changed to adopt this new direction?",
    );
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

  it("keeps a conflict candidate proposed until explicit confirmation", async () => {
    const activeCandidate = modelResult();
    activeCandidate.extractedMemories[0]!.status = "active";
    const { analyzer, send } = analyzerFor(activeCandidate);

    const result = await analyzer.analyze(context);

    expect(result.extractedMemories[0]?.status).toBe("proposed");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("reviews a missing conflict once against an active decision", async () => {
    const noConflict = modelResult({
      conflicts: [],
      retrievedEvidenceIds: [],
    });
    const { analyzer, send } = analyzerForResponses([
      JSON.stringify(noConflict),
      JSON.stringify(modelResult()),
    ]);

    const result = await analyzer.analyze(context);

    expect(result.conflicts).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[0]?.input.system[0].text).toContain(
      "Re-evaluate the new conversation evidence against every retrieved active decision",
    );
  });

  it("keeps a reviewed non-conflicting decision proposed", async () => {
    const noConflict = modelResult({
      extractedMemories: [
        {
          kind: "decision",
          status: "active",
          content: newStatement,
          rationale: null,
          sourceQuoteId: "conversation-quote-1",
          confidence: 0.9,
        },
      ],
      conflicts: [],
      retrievedEvidenceIds: [],
    });
    const { analyzer, send } = analyzerForResponses([
      JSON.stringify(noConflict),
      JSON.stringify(noConflict),
    ]);

    const result = await analyzer.analyze(context);

    expect(result.conflicts).toEqual([]);
    expect(result.extractedMemories[0]?.status).toBe("proposed");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("repairs a conflict linked to a non-decision memory kind", async () => {
    const invalidKind = modelResult();
    invalidKind.extractedMemories[0]!.kind = "rationale";
    const { analyzer, send } = analyzerForResponses([
      JSON.stringify(invalidKind),
      JSON.stringify(modelResult()),
    ]);

    const result = await analyzer.analyze(context);

    expect(result.extractedMemories[0]?.kind).toBe("requirement");
    expect(send.mock.calls[1]?.[0]?.input.system[0].text).toContain(
      "kind is requirement or decision",
    );
  });

  it("repairs an unknown conversation evidence ID", async () => {
    const ungrounded = modelResult();
    ungrounded.extractedMemories[0]!.sourceQuoteId = "invented-quote";
    const { analyzer, send } = analyzerForResponses([
      JSON.stringify(ungrounded),
      JSON.stringify(modelResult()),
    ]);

    const result = await analyzer.analyze({
      ...context,
      request: {
        ...context.request,
        conversationText: `${newStatement} Keep the existing contact form.`,
      },
    });

    expect(result.extractedMemories[0]?.sourceQuote).toBe(newStatement);
    expect(send.mock.calls[1]?.[0]?.input.system[0].text).toContain(
      "use a sourceQuoteId copied exactly from conversationEvidence",
    );
  });

  it("grounds Japanese memories in the only available evidence", async () => {
    const japaneseStatement =
      "顧客は、訪問者が予約を申し込めるように、すべてのページへ予約ボタンを追加したいと希望しています。";
    const japaneseResult = modelResult();
    japaneseResult.extractedMemories[0]!.content = japaneseStatement;
    japaneseResult.extractedMemories[0]!.sourceQuoteId = "invented-quote";
    japaneseResult.extractedMemories.push({
      kind: "open_question",
      status: "proposed",
      content: "予約導線の詳細を確認する必要があります。",
      rationale: null,
      sourceQuoteId: "another-invented-quote",
      confidence: 0.8,
    });
    japaneseResult.conflicts[0]!.newStatement = japaneseStatement;
    const { analyzer, send } = analyzerFor(japaneseResult);

    const result = await analyzer.analyze({
      ...context,
      request: {
        ...context.request,
        conversationText: japaneseStatement,
        locale: "ja",
      },
    });

    expect(result.extractedMemories[0]?.sourceQuote).toBe(japaneseStatement);
    expect(result.extractedMemories[1]?.sourceQuote).toBe(japaneseStatement);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("replaces model-supplied quote text with host-owned evidence", async () => {
    const forged = modelResult();
    Object.assign(forged.extractedMemories[0]!, {
      sourceQuote: "A quote that was never supplied by the client.",
    });
    const { analyzer, send } = analyzerFor(forged);

    const result = await analyzer.analyze(context);

    expect(result.extractedMemories[0]?.sourceQuote).toBe(newStatement);
    expect(send).toHaveBeenCalledTimes(1);
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
          sourceQuoteId: "conversation-quote-2",
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
