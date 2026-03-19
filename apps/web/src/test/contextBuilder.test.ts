import { describe, expect, it } from "vitest";
import { getStrategyPlugin } from "../strategies";
import { createRepositories } from "../db/repositories";
import { buildAIContextBundle } from "../agent/context";
import { createTestDatabase, MockEmbeddingClient } from "./testUtils";

describe("buildAIContextBundle", () => {
  it("returns a limited, relevant context bundle instead of the full database", async () => {
    const database = createTestDatabase();
    const repositories = createRepositories(database);
    const embeddingClient = new MockEmbeddingClient();

    await repositories.settings.ensureDefaults();

    const createdTasks = await repositories.tasks.batchCreate(
      Array.from({ length: 12 }, (_, index) => ({
        title:
          index < 8 ? `展会任务 ${index}` : `General admin ${index}`,
        type: "task" as const,
        status: "next" as const,
        strategyBucket: "next-actions",
        priority: "medium" as const,
        notes: index < 8 ? "和展会有关" : "普通事项",
        tags: index < 8 ? ["展会"] : ["admin"],
      })),
      "next-actions",
    );

    for (const task of createdTasks) {
      const embedding = await embeddingClient.embedText(task.title);
      await repositories.embeddings.put({
        itemId: task.id,
        itemType: "task",
        content: task.title,
        vector: embedding.vector,
        provider: embedding.provider,
        updatedAt: task.updatedAt,
      });
    }

    for (let index = 0; index < 10; index += 1) {
      const memory = await repositories.memories.upsert({
        kind: "long_term",
        category: "pattern",
        summary:
          index < 5
            ? `展会复盘经验 ${index}`
            : `普通记忆 ${index}`,
        sourceTurnIds: [],
        salience: 0.8,
      });
      const embedding = await embeddingClient.embedText(memory.summary);
      await repositories.embeddings.put({
        itemId: memory.id,
        itemType: "memory",
        content: memory.summary,
        vector: embedding.vector,
        provider: embedding.provider,
        updatedAt: memory.createdAt,
      });
    }

    const bundle = await buildAIContextBundle({
      database,
      userMessage: "帮我梳理展会项目",
      activeStrategy: getStrategyPlugin("gtd"),
      embeddingClient,
      isOnline: true,
    });

    expect(bundle.retrievedTasks.length).toBeLessThanOrEqual(10);
    expect(bundle.retrievedMemories.length).toBeLessThanOrEqual(8);
    expect(bundle.retrievedTasks.every((task) => task.title.includes("展会"))).toBe(true);
  });
});
