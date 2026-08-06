import { describe, expect, it, vi } from "vitest";
import type { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import {
  createEmbedding,
  DEFAULT_EMBEDDING_MODEL_ID,
  EMBEDDING_DIMENSIONS,
} from "./embedding.js";

describe("createEmbedding", () => {
  it("invokes Cohere Embed Multilingual v3 and validates 1024 dimensions", async () => {
    const embedding = Array.from(
      { length: EMBEDDING_DIMENSIONS },
      (_, index) => index / EMBEDDING_DIMENSIONS,
    );
    const send = vi.fn().mockResolvedValue({
      body: new TextEncoder().encode(JSON.stringify({ embeddings: [embedding] })),
    });

    const result = await createEmbedding({
      client: { send } as unknown as BedrockRuntimeClient,
      text: "Add a booking button to every page.",
      inputType: "search_query",
    });

    expect(result).toEqual(embedding);
    const commandInput = send.mock.calls[0]?.[0]?.input;
    expect(commandInput.modelId).toBe(DEFAULT_EMBEDDING_MODEL_ID);
    expect(JSON.parse(commandInput.body)).toMatchObject({
      texts: ["Add a booking button to every page."],
      input_type: "search_query",
      embedding_types: ["float"],
    });
  });

  it("rejects an invalid embedding dimension", async () => {
    const send = vi.fn().mockResolvedValue({
      body: new TextEncoder().encode(JSON.stringify({ embeddings: [[0, 1]] })),
    });

    await expect(
      createEmbedding({
        client: { send } as unknown as BedrockRuntimeClient,
        text: "test",
        inputType: "search_document",
      }),
    ).rejects.toThrow("Bedrock returned an invalid embedding.");
  });

  it("accepts the typed float response returned with embedding_types", async () => {
    const embedding = Array.from(
      { length: EMBEDDING_DIMENSIONS },
      (_, index) => index / EMBEDDING_DIMENSIONS,
    );
    const send = vi.fn().mockResolvedValue({
      body: new TextEncoder().encode(
        JSON.stringify({ embeddings: { float: [embedding] } }),
      ),
    });

    const result = await createEmbedding({
      client: { send } as unknown as BedrockRuntimeClient,
      text: "Store this client decision.",
      inputType: "search_document",
    });

    expect(result).toEqual(embedding);
  });

  it("rejects a 1024-dimensional response containing a non-finite value", async () => {
    const embedding = Array.from(
      { length: EMBEDDING_DIMENSIONS },
      (_, index) => index / EMBEDDING_DIMENSIONS,
    );
    embedding[0] = Number.NaN;
    const send = vi.fn().mockResolvedValue({
      body: new TextEncoder().encode(JSON.stringify({ embeddings: [embedding] })),
    });

    await expect(
      createEmbedding({
        client: { send } as unknown as BedrockRuntimeClient,
        text: "test",
        inputType: "search_document",
      }),
    ).rejects.toThrow("Bedrock returned an invalid embedding.");
  });
});
