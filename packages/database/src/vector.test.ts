import { describe, expect, it } from "vitest";
import { retrieveSimilarMemories, toVectorLiteral } from "./vector.js";

describe("toVectorLiteral", () => {
  it("serializes exactly 1024 finite dimensions", () => {
    const vector = Array.from({ length: 1024 }, (_, index) => index / 1024);
    const literal = toVectorLiteral(vector);

    expect(literal.startsWith("[0,")).toBe(true);
    expect(literal.endsWith("]")).toBe(true);
    expect(literal.split(",")).toHaveLength(1024);
  });

  it("rejects the wrong vector dimension", () => {
    expect(() => toVectorLiteral([0, 1])).toThrow(
      "Expected 1024 finite embedding values.",
    );
  });

  it("normalizes pg timestamps before validating retrieved memory", async () => {
    const createdAt = new Date("2026-08-04T04:30:00.000Z");
    const pool = {
      query: async () => ({
        rows: [
          {
            id: "10000000-0000-4000-8000-000000000004",
            projectId: "10000000-0000-4000-8000-000000000002",
            sourceConversationId: "10000000-0000-4000-8000-000000000003",
            kind: "decision",
            status: "active",
            content: "Do not include online booking in the launch scope.",
            rationale: "Phone booking is sufficient for launch.",
            createdAt,
          },
        ],
      }),
    };

    const memories = await retrieveSimilarMemories({
      pool: pool as never,
      projectId: "10000000-0000-4000-8000-000000000002",
      embedding: Array.from({ length: 1024 }, () => 0.5),
    });

    expect(memories[0]?.createdAt).toBe(createdAt.toISOString());
  });
});
