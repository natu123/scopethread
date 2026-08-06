import { describe, expect, it } from "vitest";
import {
  activeDecisionLabel,
  analysesLeftLabel,
  copy,
  groundedRecordsLabel,
  memoryKindLabel,
  memoryStatusLabel,
  translateDemoText,
} from "./i18n.js";

describe("web localization", () => {
  it("keeps English as the primary hackathon language", () => {
    expect(copy.en.introTitle).toBe("Keep every client decision connected.");
    expect(analysesLeftLabel(1, "en")).toBe("1 analysis left");
    expect(analysesLeftLabel(3, "en")).toBe("3 analyses left");
    expect(groundedRecordsLabel(1, "en")).toContain("record.");
  });

  it("provides natural Japanese labels without spaced Japanese prose", () => {
    expect(copy.ja.introTitle).toBe("顧客との意思決定を、すべてつなげて残す。");
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
});
