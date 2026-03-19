import {
  toolCallSchema,
  type MemoryInput,
  type StrategyId,
  type ToolCall,
} from "@ai-todo/contracts";
import type { AITodoDB } from "../db/database";
import { createRepositories } from "../db/repositories";
import { defaultBucketForTask, getStrategyPlugin } from "../strategies";
import type { EmbeddingClientLike } from "./embedding";

export const shouldPersistLongTermMemory = (memory: MemoryInput) => {
  if (memory.kind !== "long_term") {
    return false;
  }

  if (memory.summary.trim().length < 16) {
    return false;
  }

  if (memory.salience < 0.55) {
    return false;
  }

  if (memory.category === "fact") {
    return memory.salience >= 0.75;
  }

  return true;
};

export const executeToolCalls = async ({
  database,
  toolCalls,
  currentStrategyId,
  embeddingClient,
}: {
  database: AITodoDB;
  toolCalls: ToolCall[];
  currentStrategyId: StrategyId;
  embeddingClient: EmbeddingClientLike;
}) => {
  const repositories = createRepositories(database);
  let activeStrategyId = currentStrategyId;

  for (const rawToolCall of toolCalls) {
    const toolCall = toolCallSchema.parse(rawToolCall);
    const strategy = getStrategyPlugin(activeStrategyId);

    if (strategy.toolPolicies.disallowedTools.includes(toolCall.name)) {
      continue;
    }

    if (toolCall.name === "batch_create_tasks") {
      const tasks = await repositories.tasks.batchCreate(
        toolCall.arguments.tasks.map((task) => ({
          ...task,
          strategyBucket: defaultBucketForTask(activeStrategyId, task),
        })),
        strategy.boardConfig.columns[0]?.id ?? "inbox",
      );
      await Promise.all(
        tasks.map(async (task) => {
          const embedding = await embeddingClient.embedText(
            [task.title, task.notes ?? "", task.tags.join(" ")].join(" "),
          );
          await repositories.embeddings.put({
            itemId: task.id,
            itemType: "task",
            content: task.title,
            vector: embedding.vector,
            provider: embedding.provider,
            updatedAt: task.updatedAt,
          });
        }),
      );
      continue;
    }

    if (toolCall.name === "update_tasks") {
      const updatedTasks = await repositories.tasks.updateMany(
        toolCall.arguments.updates,
      );
      await Promise.all(
        updatedTasks.map(async (task) => {
          const embedding = await embeddingClient.embedText(
            [task.title, task.notes ?? "", task.tags.join(" ")].join(" "),
          );
          await repositories.embeddings.put({
            itemId: task.id,
            itemType: "task",
            content: task.title,
            vector: embedding.vector,
            provider: embedding.provider,
            updatedAt: task.updatedAt,
          });
        }),
      );
      continue;
    }

    if (toolCall.name === "archive_tasks") {
      await repositories.tasks.archiveMany(toolCall.arguments.taskIds);
      await Promise.all(
        toolCall.arguments.taskIds.map((taskId) =>
          repositories.embeddings.removeForItem(taskId, "task"),
        ),
      );
      continue;
    }

    if (toolCall.name === "upsert_memory") {
      if (!shouldPersistLongTermMemory(toolCall.arguments.memory)) {
        continue;
      }

      const memory = await repositories.memories.upsert(toolCall.arguments.memory);
      const embedding = await embeddingClient.embedText(memory.summary);
      await repositories.embeddings.put({
        itemId: memory.id,
        itemType: "memory",
        content: memory.summary,
        vector: embedding.vector,
        provider: embedding.provider,
        updatedAt: memory.createdAt,
      });
      continue;
    }

    if (toolCall.name === "set_strategy") {
      await repositories.settings.set(
        "activeStrategyId",
        toolCall.arguments.strategyId,
      );
      activeStrategyId = toolCall.arguments.strategyId;
    }
  }
};
