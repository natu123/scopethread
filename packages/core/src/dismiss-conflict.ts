import {
  DismissConflictRequestSchema,
  type ConflictDismissalOutcome,
} from "./models.js";
import type { ConflictDismissalRepository } from "./ports.js";

export type DismissConflictErrorCode =
  | "CONFLICT_NOT_FOUND"
  | "CONFLICT_STATE_CONFLICT";

export class DismissConflictError extends Error {
  override readonly name = "DismissConflictError";

  constructor(readonly code: DismissConflictErrorCode) {
    super(`Conflict dismissal failed (${code}).`);
  }
}

export class DismissConflict {
  constructor(private readonly repository: ConflictDismissalRepository) {}

  async execute(input: unknown): Promise<ConflictDismissalOutcome> {
    const request = DismissConflictRequestSchema.parse(input);
    const result = await this.repository.dismissConflict(request);

    if (result.status === "not_found") {
      throw new DismissConflictError("CONFLICT_NOT_FOUND");
    }
    if (result.status === "invalid_state") {
      throw new DismissConflictError("CONFLICT_STATE_CONFLICT");
    }

    const { status: _status, ...outcome } = result;
    return outcome;
  }
}
