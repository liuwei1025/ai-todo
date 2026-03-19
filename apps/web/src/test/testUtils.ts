import type { AgentResponse } from "@ai-todo/contracts";
import { createAppDatabase } from "../db/database";
import { buildFallbackVector, type EmbeddingClientLike } from "../agent/embedding";

export class MockEmbeddingClient implements EmbeddingClientLike {
  async embedText(text: string) {
    return {
      vector: buildFallbackVector(text),
      provider: "fallback" as const,
    };
  }
}

export const createTestDatabase = () =>
  createAppDatabase(`ai-todo-test-${crypto.randomUUID()}`);

export const mockAgentResponse = (response: AgentResponse) => async () => response;
