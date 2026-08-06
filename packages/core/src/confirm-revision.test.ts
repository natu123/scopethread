import { describe, expect, it } from "vitest";
import { ConfirmRevision } from "./confirm-revision.js";
import type {
  ConfirmRevisionResult,
  RevisionRepository,
} from "./ports.js";

const request = {
  projectId: "10000000-0000-4000-8000-000000000002",
  agentRunId: "10000000-0000-4000-8000-000000000005",
  priorMemoryId: "10000000-0000-4000-8000-000000000004",
  reason: "The client approved online booking after changing the launch scope.",
};

class FakeRevisionRepository implements RevisionRepository {
  readonly requests: unknown[] = [];

  constructor(private readonly result: ConfirmRevisionResult) {}

  async confirmRevision(input: unknown): Promise<ConfirmRevisionResult> {
    this.requests.push(input);
    return this.result;
  }
}

describe("ConfirmRevision", () => {
  it("returns a confirmed revision from the repository", async () => {
    const repository = new FakeRevisionRepository({
      status: "confirmed",
      priorMemoryId: request.priorMemoryId,
      replacementMemoryId: "10000000-0000-4000-8000-000000000006",
      reason: request.reason,
      revisedAt: "2026-08-06T03:00:00.000Z",
      changed: true,
    });
    const useCase = new ConfirmRevision(repository);

    await expect(useCase.execute(request)).resolves.toMatchObject({
      priorMemoryId: request.priorMemoryId,
      changed: true,
    });
    expect(repository.requests).toEqual([request]);
  });

  it("maps a missing conflict proposal to a stable error", async () => {
    const useCase = new ConfirmRevision(
      new FakeRevisionRepository({ status: "not_found" }),
    );

    await expect(useCase.execute(request)).rejects.toMatchObject({
      name: "ConfirmRevisionError",
      code: "REVISION_NOT_FOUND",
    });
  });

  it("maps an invalid memory transition to a stable error", async () => {
    const useCase = new ConfirmRevision(
      new FakeRevisionRepository({ status: "invalid_state" }),
    );

    await expect(useCase.execute(request)).rejects.toMatchObject({
      code: "REVISION_STATE_CONFLICT",
    });
  });

  it("rejects a revision without a meaningful reason", async () => {
    const repository = new FakeRevisionRepository({ status: "not_found" });
    const useCase = new ConfirmRevision(repository);

    await expect(useCase.execute({ ...request, reason: " " })).rejects.toThrow();
    expect(repository.requests).toHaveLength(0);
  });
});
