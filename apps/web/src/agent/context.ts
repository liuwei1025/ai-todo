import type { AIContextBundle, StrategyPluginSnapshot } from "@ai-todo/contracts";
import type { AITodoDB } from "../db/database";
import { createRepositories } from "../db/repositories";
import type { EmbeddingClientLike } from "./embedding";

const uniqueBy = <T extends { id: string }>(items: T[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
};

const tokenize = (message: string) =>
  Array.from(
    new Set(
      message
        .toLowerCase()
        .split(/[^a-zA-Z0-9\u4e00-\u9fa5]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2),
    ),
  ).slice(0, 8);

export const buildAIContextBundle = async ({
  database,
  userMessage,
  activeStrategy,
  embeddingClient,
  isOnline,
}: {
  database: AITodoDB;
  userMessage: string;
  activeStrategy: StrategyPluginSnapshot;
  embeddingClient: EmbeddingClientLike;
  isOnline: boolean;
}): Promise<AIContextBundle> => {
  const repositories = createRepositories(database);
  const keywords = tokenize(userMessage);
  const [recentTurns, keywordTasks, keywordMemories, allTasks] = await Promise.all([
    repositories.turns.listRecent(10),
    repositories.tasks.keywordSearch(keywords, 6),
    repositories.memories.keywordSearch(keywords, 4),
    repositories.tasks.listAll(),
  ]);

  const queryEmbedding = await embeddingClient.embedText(userMessage);

  const [similarTaskEntries, similarMemoryEntries] = await Promise.all([
    repositories.embeddings.querySimilar("task", queryEmbedding.vector, 4),
    repositories.embeddings.querySimilar("memory", queryEmbedding.vector, 4),
  ]);

  const [vectorTasks, vectorMemories] = await Promise.all([
    repositories.tasks.listByIds(
      similarTaskEntries.map((candidate) => candidate.record.itemId),
    ),
    repositories.memories.listAll().then((memories) =>
      memories.filter((memory) =>
        similarMemoryEntries.some(
          (candidate) => candidate.record.itemId === memory.id,
        ),
      ),
    ),
  ]);

  const taskCounts = allTasks.reduce<Record<string, number>>((counts, task) => {
    counts[task.status] = (counts[task.status] ?? 0) + 1;
    return counts;
  }, {});

  return {
    userMessage,
    activeStrategy,
    recentTurns,
    retrievedTasks: uniqueBy([...keywordTasks, ...vectorTasks]).slice(0, 10),
    retrievedMemories: uniqueBy([...keywordMemories, ...vectorMemories]).slice(0, 8),
    uiStateSnapshot: {
      taskCounts,
      boardMode: activeStrategy.boardConfig.mode,
      isOnline,
    },
  };
};
