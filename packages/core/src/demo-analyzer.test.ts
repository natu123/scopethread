import { describe, expect, it } from "vitest";
import type { StoredMemory } from "./models.js";
import { DemoConversationAnalyzer } from "./demo-analyzer.js";

const priorMemory: StoredMemory = {
  id: "10000000-0000-4000-8000-000000000004",
  projectId: "10000000-0000-4000-8000-000000000002",
  sourceConversationId: "10000000-0000-4000-8000-000000000003",
  kind: "decision",
  status: "active",
  content: "Do not include online booking in the launch scope.",
  rationale: "Phone booking is sufficient for launch.",
  createdAt: "2026-08-04T00:00:00.000Z",
};

describe("DemoConversationAnalyzer localization", () => {
  it("returns natural Japanese analysis for a Japanese request", async () => {
    const result = (await new DemoConversationAnalyzer().analyze({
      request: {
        projectId: priorMemory.projectId,
        conversationText: "全ページに予約ボタンを追加してください。",
        idempotencyKey: "demo-analyzer-ja-001",
        locale: "ja",
      },
      retrievedMemories: [priorMemory],
    })) as {
      summary: string;
      conflicts: Array<{ confirmationQuestion: string }>;
      nextQuestions: string[];
    };

    expect(result.summary).toBe("新しい依頼は、有効な予約方針と矛盾しています。");
    expect(result.conflicts[0]?.confirmationQuestion).toContain("以前の決定");
    expect(result.nextQuestions[0]).toContain("何が変わりましたか");
  });
});
