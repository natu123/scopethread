import { describe, expect, it } from "vitest";
import {
  activeDecisionLabel,
  analysesLeftLabel,
  copy,
  groundedRecordsLabel,
  memoryKindLabel,
  memoryStatusLabel,
  translateApiMessage,
  translateDemoText,
} from "./i18n.js";

describe("web localization", () => {
  it("keeps English as the primary hackathon language", () => {
    expect(copy.en.introTitle).toBe("Keep every client decision connected.");
    expect(copy.en.nextQuestion).toBe("Confirmation needed");
    expect(copy.en.emptyNextQuestion).toBe(
      "A grounded confirmation prompt will appear here.",
    );
    expect(copy.en.confirmRevision).toBe("Adopt new direction");
    expect(copy.en.dismissConflict).toBe("Keep current decision");
    expect(copy.en.reasonPlaceholder).toBe(
      "Explain why this direction was chosen.",
    );
    expect(analysesLeftLabel(1, "en")).toBe("1 analysis left");
    expect(analysesLeftLabel(3, "en")).toBe("3 analyses left");
    expect(groundedRecordsLabel(1, "en")).toContain("record.");
  });

  it("provides natural Japanese labels without spaced Japanese prose", () => {
    expect(copy.ja.introTitle).toBe("顧客との意思決定を、すべてつなげて残す。");
    expect(copy.ja.introTitleLines).toEqual([
      "顧客との意思決定を、",
      "すべてつなげて残す。",
    ]);
    expect(copy.ja.nextQuestion).toBe("確認が必要です");
    expect(copy.ja.emptyNextQuestion).toBe(
      "根拠に基づく確認事項が、ここに表示されます。",
    );
    expect(copy.ja.confirmRevision).toBe("新しい方針を採用");
    expect(copy.ja.dismissConflict).toBe("現在の決定を維持");
    expect(copy.ja.reasonPlaceholder).toBe(
      "この方針を選んだ理由を入力してください。",
    );
    expect(activeDecisionLabel(2, "ja")).toBe("有効な決定 2件");
    expect(memoryKindLabel("open_question", "ja")).toBe("未決事項");
    expect(memoryStatusLabel("superseded", "ja")).toBe("更新済み");
  });

  it("translates known demo evidence while preserving unknown client text", () => {
    expect(
      translateDemoText("Do not include online booking in the launch scope.", "ja"),
    ).toBe("初回公開の対象にオンライン予約を含めない。");
    expect(translateDemoText("顧客独自の原文", "ja")).toBe("顧客独自の原文");
  });

  it("translates the sanitized analysis failure", () => {
    expect(
      translateApiMessage(
        "The agent could not analyze this conversation.",
        "ja",
      ),
    ).toBe("エージェントはこの会話を分析できませんでした。");
  });
});
