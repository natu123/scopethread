import type { ConversationAnalyzer } from "./ports.js";

function mentionsBooking(text: string): boolean {
  return text.toLowerCase().includes("booking") || text.includes("予約");
}

export class DemoConversationAnalyzer implements ConversationAnalyzer {
  async analyze({ request, retrievedMemories }: Parameters<ConversationAnalyzer["analyze"]>[0]) {
    const japanese = request.locale === "ja";
    const priorBookingDecision = retrievedMemories.find(
      (memory) =>
        memory.kind === "decision" &&
        memory.status === "active" &&
        mentionsBooking(memory.content),
    );
    const hasBookingRequest = mentionsBooking(request.conversationText);

    return {
      summary:
        priorBookingDecision && hasBookingRequest
          ? japanese
            ? "新しい依頼は、有効な予約方針と矛盾しています。"
            : "The new request conflicts with an active booking decision."
          : japanese
            ? "既知の矛盾はなく、会話を分析しました。"
            : "The conversation was analyzed without a known conflict.",
      extractedMemories: [
        {
          kind: "requirement",
          status: "proposed",
          content: request.conversationText,
          rationale: null,
          sourceQuote: request.conversationText,
          confidence: 0.5,
        },
      ],
      conflicts:
        priorBookingDecision && hasBookingRequest
          ? [
              {
                priorMemoryId: priorBookingDecision.id,
                newStatement: request.conversationText,
                explanation:
                  japanese
                    ? "プロジェクトで予約機能を明確に除外した後に、新しい依頼で予約機能が追加されています。"
                    : "The new request introduces booking after the project explicitly excluded it.",
                confirmationQuestion:
                  japanese
                    ? "予約機能を追加しないという以前の決定を更新しますか。また、何が変わりましたか。"
                    : "Should the previous no-booking decision be superseded, and what changed?",
              },
            ]
          : [],
      nextQuestions: [
        priorBookingDecision && hasBookingRequest
          ? japanese
            ? "予約機能を追加しないという以前の決定を更新しますか。また、何が変わりましたか。"
            : "Should the previous no-booking decision be superseded, and what changed?"
          : japanese
            ? "この依頼により、サイト訪問者へどのような結果を提供しますか。"
            : "What outcome should this request produce for the site visitor?",
      ],
      retrievedEvidenceIds: retrievedMemories.map((memory) => memory.id),
    };
  }
}
