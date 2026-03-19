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

export interface ToolCallResult {
  name: string;
  status: "executed" | "skipped" | "failed";
  error?: string;
}

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
}): Promise<ToolCallResult[]> => {
  const repositories = createRepositories(database);
  let activeStrategyId = currentStrategyId;
  const results: ToolCallResult[] = [];

  for (const rawToolCall of toolCalls) {
    let toolCall: ToolCall;
    try {
      toolCall = toolCallSchema.parse(rawToolCall);
    } catch (parseError) {
      results.push({
        name: "unknown",
        status: "failed",
        error: parseError instanceof Error ? parseError.message : "Schema validation failed",
      });
      continue;
    }

    const strategy = getStrategyPlugin(activeStrategyId);

    if (strategy.toolPolicies.disallowedTools.includes(toolCall.name)) {
      results.push({ name: toolCall.name, status: "skipped" });
      continue;
    }

    try {
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
      } else if (toolCall.name === "update_tasks") {
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
      } else if (toolCall.name === "archive_tasks") {
        await repositories.tasks.archiveMany(toolCall.arguments.taskIds);
        await Promise.all(
          toolCall.arguments.taskIds.map((taskId) =>
            repositories.embeddings.removeForItem(taskId, "task"),
          ),
        );
      } else if (toolCall.name === "upsert_memory") {
        if (!shouldPersistLongTermMemory(toolCall.arguments.memory)) {
          results.push({ name: toolCall.name, status: "skipped" });
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
      } else if (toolCall.name === "set_strategy") {
        await repositories.settings.set(
          "activeStrategyId",
          toolCall.arguments.strategyId,
        );
        activeStrategyId = toolCall.arguments.strategyId;
      }

      results.push({ name: toolCall.name, status: "executed" });
    } catch (execError) {
      results.push({
        name: toolCall.name,
        status: "failed",
        error: execError instanceof Error ? execError.message : "Tool execution failed",
      });
    }
  }

  return results;
};
