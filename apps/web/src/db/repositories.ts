import type {
  ConversationTurn,
  Memory,
  MemoryInput,
  Task,
  TaskCreateInput,
  TaskUpdateInput,
} from "@ai-todo/contracts";
import type { AITodoDB, EmbeddingRecord } from "./database";
import { DEFAULT_AGENT_ENDPOINT, LEGACY_AGENT_ENDPOINT } from "../agent/api";

const ISO_NOW = () => new Date().toISOString();

const includesKeyword = (haystack: string, keywords: string[]) =>
  keywords.some((keyword) => haystack.includes(keyword));

const cosineSimilarity = (left: number[], right: number[]) => {
  if (left.length !== right.length || left.length === 0) {
    return 0;
  }

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
};

export const createRepositories = (database: AITodoDB) => ({
  settings: {
    async ensureDefaults() {
      const [strategy, endpoint] = await Promise.all([
        database.settings.get("activeStrategyId"),
        database.settings.get("agentEndpoint"),
      ]);

      const writes = [];
      if (!strategy) {
        writes.push(database.settings.put({ key: "activeStrategyId", value: "gtd" }));
      }
      if (!endpoint) {
        writes.push(
          database.settings.put({
            key: "agentEndpoint",
            value: DEFAULT_AGENT_ENDPOINT,
          }),
        );
      } else if (endpoint.value === LEGACY_AGENT_ENDPOINT) {
        writes.push(
          database.settings.put({
            key: "agentEndpoint",
            value: DEFAULT_AGENT_ENDPOINT,
          }),
        );
      }
      await Promise.all(writes);
    },
    async get(key: "activeStrategyId" | "agentEndpoint") {
      return database.settings.get(key);
    },
    async set(key: "activeStrategyId" | "agentEndpoint", value: string) {
      await database.settings.put({ key, value });
    },
  },
  tasks: {
    async listAll() {
      return database.tasks.orderBy("updatedAt").reverse().toArray();
    },
    async listByIds(ids: string[]) {
      const records = await database.tasks.bulkGet(ids);
      return records.filter((record): record is Task => Boolean(record));
    },
    async batchCreate(inputs: TaskCreateInput[], defaultBucket: string) {
      const createdAt = ISO_NOW();
      const tasks = inputs.map((input) => ({
        id: crypto.randomUUID(),
        title: input.title,
        type: input.type ?? "task",
        status: input.status ?? "inbox",
        strategyBucket: input.strategyBucket ?? defaultBucket,
        priority: input.priority ?? "medium",
        dueAt: input.dueAt ?? null,
        notes: input.notes ?? null,
        tags: input.tags ?? [],
        createdAt,
        updatedAt: createdAt,
      }));
      await database.tasks.bulkAdd(tasks);
      return tasks;
    },
    async updateMany(updates: TaskUpdateInput[]) {
      const updatedTasks: Task[] = [];
      await database.transaction("rw", database.tasks, async () => {
        for (const patch of updates) {
          const existing = await database.tasks.get(patch.id);
          if (!existing) {
            continue;
          }
          const updatedTask: Task = {
            ...existing,
            ...patch,
            updatedAt: ISO_NOW(),
          };
          await database.tasks.put(updatedTask);
          updatedTasks.push(updatedTask);
        }
      });
      return updatedTasks;
    },
    async updateOne(id: string, patch: Omit<TaskUpdateInput, "id">) {
      const [updatedTask] = await this.updateMany([{ id, ...patch }]);
      return updatedTask ?? null;
    },
    async archiveMany(taskIds: string[]) {
      return this.updateMany(
        taskIds.map((taskId) => ({ id: taskId, status: "archived" as const })),
      );
    },
    async keywordSearch(keywords: string[], limit = 6) {
      if (keywords.length === 0) {
        return [];
      }
      const tasks = await database.tasks.toArray();
      return tasks
        .filter((task) =>
          includesKeyword(
            [
              task.title,
              task.notes ?? "",
              task.tags.join(" "),
              task.strategyBucket,
            ]
              .join(" ")
              .toLowerCase(),
            keywords,
          ),
        )
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, limit);
    },
  },
  turns: {
    async add(role: ConversationTurn["role"], content: string) {
      const turn: ConversationTurn = {
        id: crypto.randomUUID(),
        role,
        content,
        createdAt: ISO_NOW(),
      };
      await database.conversation_turns.add(turn);
      await this.trimRecent(10);
      return turn;
    },
    async listRecent(limit = 10) {
      const records = await database.conversation_turns
        .orderBy("createdAt")
        .reverse()
        .limit(limit)
        .toArray();
      return records.reverse();
    },
    async trimRecent(limit = 10) {
      const allTurns = await database.conversation_turns
        .orderBy("createdAt")
        .reverse()
        .toArray();
      const staleTurns = allTurns.slice(limit).map((turn) => turn.id);
      if (staleTurns.length > 0) {
        await database.conversation_turns.bulkDelete(staleTurns);
      }
    },
  },
  memories: {
    async listAll() {
      return database.memories.orderBy("createdAt").reverse().toArray();
    },
    async listLongTerm(limit = 6) {
      const memories = await database.memories
        .where("kind")
        .equals("long_term")
        .toArray();
      return memories.sort((a, b) => b.salience - a.salience).slice(0, limit);
    },
    async upsert(input: MemoryInput) {
      const existing = await database.memories
        .filter(
          (memory) =>
            memory.summary === input.summary && memory.category === input.category,
        )
        .first();
      const memory: Memory = {
        id: existing?.id ?? crypto.randomUUID(),
        kind: input.kind ?? "long_term",
        category: input.category,
        summary: input.summary,
        sourceTurnIds: Array.from(
          new Set([...(existing?.sourceTurnIds ?? []), ...(input.sourceTurnIds ?? [])]),
        ),
        salience: Math.max(existing?.salience ?? 0, input.salience ?? 0.7),
        createdAt: existing?.createdAt ?? ISO_NOW(),
      };
      await database.memories.put(memory);
      return memory;
    },
    async updateSalience(id: string, salience: number) {
      const existing = await database.memories.get(id);
      if (!existing) {
        return null;
      }
      const memory: Memory = {
        ...existing,
        salience: Math.min(1, Math.max(0, Number(salience.toFixed(2)))),
      };
      await database.memories.put(memory);
      return memory;
    },
    async remove(id: string) {
      await database.memories.delete(id);
    },
    async keywordSearch(keywords: string[], limit = 4) {
      if (keywords.length === 0) {
        return [];
      }
      const memories = await database.memories.toArray();
      return memories
        .filter((memory) =>
          includesKeyword(memory.summary.toLowerCase(), keywords),
        )
        .sort((left, right) => right.salience - left.salience)
        .slice(0, limit);
    },
  },
  embeddings: {
    async put(record: Omit<EmbeddingRecord, "id">) {
      const existing = await database.embeddings
        .where("[itemId+itemType]")
        .equals([record.itemId, record.itemType])
        .first();
      if (existing?.id) {
        await database.embeddings.put({ ...record, id: existing.id });
        return existing.id;
      }
      return database.embeddings.add(record);
    },
    async removeForItem(itemId: string, itemType: "task" | "memory") {
      const records = await database.embeddings
        .filter((entry) => entry.itemId === itemId && entry.itemType === itemType)
        .toArray();
      await database.embeddings.bulkDelete(
        records
          .map((record) => record.id)
          .filter((id): id is number => typeof id === "number"),
      );
    },
    async querySimilar(
      itemType: "task" | "memory",
      vector: number[],
      limit: number,
    ) {
      const records = await database.embeddings
        .filter((entry) => entry.itemType === itemType)
        .toArray();
      return records
        .map((record) => ({
          record,
          score: cosineSimilarity(record.vector, vector),
        }))
        .filter((candidate) => candidate.score > 0.2)
        .sort((left, right) => right.score - left.score)
        .slice(0, limit);
    },
  },
});
