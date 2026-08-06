import { describe, expect, it } from "vitest";
import { DismissConflict } from "./dismiss-conflict.js";
import type {
  ConflictDismissalRepository,
  DismissConflictResult,
} from "./ports.js";

const request = {
  projectId: "10000000-0000-4000-8000-000000000002",
  agentRunId: "10000000-0000-4000-8000-000000000005",
  priorMemoryId: "10000000-0000-4000-8000-000000000004",
  reason: "The new request was exploratory and is not approved scope.",
};

class FakeConflictDismissalRepository
  implements ConflictDismissalRepository
{
  readonly requests: unknown[] = [];

  constructor(private readonly result: DismissConflictResult) {}

  async dismissConflict(input: unknown): Promise<DismissConflictResult> {
    this.requests.push(input);
    return this.result;
  }
}

describe("DismissConflict", () => {
  it("returns a dismissed conflict from the repository", async () => {
    const repository = new FakeConflictDismissalRepository({
      status: "dismissed",
      priorMemoryId: request.priorMemoryId,
      dismissedMemoryId: "10000000-0000-4000-8000-000000000006",
      reason: request.reason,
      dismissedAt: "2026-08-06T05:00:00.000Z",
      changed: true,
    });
    const useCase = new DismissConflict(repository);

    await expect(useCase.execute(request)).resolves.toMatchObject({
      priorMemoryId: request.priorMemoryId,
      changed: true,
    });
    expect(repository.requests).toEqual([request]);
  });

  it("maps a missing proposal to a stable error", async () => {
    const useCase = new DismissConflict(
      new FakeConflictDismissalRepository({ status: "not_found" }),
    );

    await expect(useCase.execute(request)).rejects.toMatchObject({
      name: "DismissConflictError",
      code: "CONFLICT_NOT_FOUND",
    });
  });

  it("maps an invalid transition to a stable error", async () => {
    const useCase = new DismissConflict(
      new FakeConflictDismissalRepository({ status: "invalid_state" }),
    );

    await expect(useCase.execute(request)).rejects.toMatchObject({
      code: "CONFLICT_STATE_CONFLICT",
    });
  });

  it("rejects a dismissal without a meaningful reason", async () => {
    const repository = new FakeConflictDismissalRepository({
      status: "not_found",
    });
    const useCase = new DismissConflict(repository);

    await expect(useCase.execute({ ...request, reason: " " })).rejects.toThrow();
    expect(repository.requests).toHaveLength(0);
  });
});
