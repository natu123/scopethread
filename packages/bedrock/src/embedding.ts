import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type { EmbeddingProvider } from "@scopethread/core";

export const DEFAULT_EMBEDDING_MODEL_ID = "cohere.embed-multilingual-v3";
export const EMBEDDING_DIMENSIONS = 1024;

export async function createEmbedding(input: {
  client: BedrockRuntimeClient;
  text: string;
  inputType: "search_document" | "search_query";
  modelId?: string;
}): Promise<number[]> {
  const response = await input.client.send(
    new InvokeModelCommand({
      modelId: input.modelId ?? DEFAULT_EMBEDDING_MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        texts: [input.text],
        input_type: input.inputType,
        truncate: "END",
        embedding_types: ["float"],
      }),
    }),
  );

  const payload = JSON.parse(new TextDecoder().decode(response.body)) as {
    embeddings?: number[][] | { float?: number[][] };
  };
  const embeddings = Array.isArray(payload.embeddings)
    ? payload.embeddings
    : payload.embeddings?.float;
  const embedding = embeddings?.[0];

  if (
    !embedding ||
    embedding.length !== EMBEDDING_DIMENSIONS ||
    embedding.some((value) => !Number.isFinite(value))
  ) {
    throw new Error("Bedrock returned an invalid embedding.");
  }

  return embedding;
}

export class BedrockEmbeddingProvider implements EmbeddingProvider {
  constructor(
    private readonly client: BedrockRuntimeClient,
    private readonly modelId = DEFAULT_EMBEDDING_MODEL_ID,
  ) {}

  embedQuery(text: string): Promise<number[]> {
    return createEmbedding({
      client: this.client,
      text,
      inputType: "search_query",
      modelId: this.modelId,
    });
  }

  embedDocument(text: string): Promise<number[]> {
    return createEmbedding({
      client: this.client,
      text,
      inputType: "search_document",
      modelId: this.modelId,
    });
  }
}
