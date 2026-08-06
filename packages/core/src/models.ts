import { z } from "zod";

export const MemoryKindSchema = z.enum([
  "requirement",
  "decision",
  "rationale",
  "open_question",
]);

export const MemoryStatusSchema = z.enum([
  "proposed",
  "active",
  "superseded",
  "resolved",
  "dismissed",
]);

export const StoredMemorySchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  sourceConversationId: z.uuid(),
  kind: MemoryKindSchema,
  status: MemoryStatusSchema,
  content: z.string().min(1),
  rationale: z.string().min(1).nullable(),
  createdAt: z.iso.datetime(),
});

export const ExtractedMemorySchema = z.object({
  kind: MemoryKindSchema,
  status: MemoryStatusSchema,
  content: z.string().min(1),
  rationale: z.string().min(1).nullable(),
  sourceQuote: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export const ConflictSchema = z.object({
  priorMemoryId: z.uuid(),
  newStatement: z.string().min(1),
  explanation: z.string().min(1),
  confirmationQuestion: z.string().min(1),
});

export const AnalysisResultSchema = z.object({
  summary: z.string().min(1),
  extractedMemories: z.array(ExtractedMemorySchema),
  conflicts: z.array(ConflictSchema),
  nextQuestions: z.array(z.string().min(1)),
  retrievedEvidenceIds: z.array(z.uuid()),
});

export const AnalyzeConversationRequestSchema = z.object({
  projectId: z.uuid(),
  conversationText: z.string().trim().min(1).max(8000),
  idempotencyKey: z.string().trim().min(8).max(128),
});

export const ConfirmRevisionRequestSchema = z.object({
  projectId: z.uuid(),
  agentRunId: z.uuid(),
  priorMemoryId: z.uuid(),
  reason: z.string().trim().min(3).max(2000),
});

export type StoredMemory = z.infer<typeof StoredMemorySchema>;
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
export type AnalyzeConversationRequest = z.infer<
  typeof AnalyzeConversationRequestSchema
>;
export type ConfirmRevisionRequest = z.infer<
  typeof ConfirmRevisionRequestSchema
>;

export type RevisionOutcome = {
  priorMemoryId: string;
  replacementMemoryId: string;
  reason: string;
  revisedAt: string;
  changed: boolean;
};

export type DemoSession = {
  sessionId: string;
  projectId: string;
  projectName: string;
  initialDecision: {
    id: string;
    content: string;
    rationale: string | null;
    sourceQuote: string;
  };
  expiresAt: string;
  maxAnalysisRequests: number;
};
