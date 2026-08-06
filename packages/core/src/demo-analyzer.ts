import type { ConversationAnalyzer } from "./ports.js";

function mentionsBooking(text: string): boolean {
  return text.toLowerCase().includes("booking") || text.includes("予約");
}

export class DemoConversationAnalyzer implements ConversationAnalyzer {
  async analyze({ request, retrievedMemories }: Parameters<ConversationAnalyzer["analyze"]>[0]) {
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
          ? "The new request conflicts with an active booking decision."
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
                  "The new request introduces booking after the project explicitly excluded it.",
                confirmationQuestion:
                  "Should the previous no-booking decision be superseded, and what changed?",
              },
            ]
          : [],
      nextQuestions: [
        priorBookingDecision && hasBookingRequest
          ? "Should the previous no-booking decision be superseded, and what changed?"
          : "What outcome should this request produce for the site visitor?",
      ],
      retrievedEvidenceIds: retrievedMemories.map((memory) => memory.id),
    };
  }
}
