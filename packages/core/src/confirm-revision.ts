import {
  ConfirmRevisionRequestSchema,
  type RevisionOutcome,
} from "./models.js";
import type { RevisionRepository } from "./ports.js";

export type ConfirmRevisionErrorCode =
  | "REVISION_NOT_FOUND"
  | "REVISION_STATE_CONFLICT";

export class ConfirmRevisionError extends Error {
  override readonly name = "ConfirmRevisionError";

  constructor(readonly code: ConfirmRevisionErrorCode) {
    super(`Revision confirmation failed (${code}).`);
  }
}

export class ConfirmRevision {
  constructor(private readonly repository: RevisionRepository) {}

  async execute(input: unknown): Promise<RevisionOutcome> {
    const request = ConfirmRevisionRequestSchema.parse(input);
    const result = await this.repository.confirmRevision(request);

    if (result.status === "not_found") {
      throw new ConfirmRevisionError("REVISION_NOT_FOUND");
    }
    if (result.status === "invalid_state") {
      throw new ConfirmRevisionError("REVISION_STATE_CONFLICT");
    }

    const { status: _status, ...outcome } = result;
    return outcome;
  }
}
