import Dexie, { type Table } from "dexie";
import type { ConversationTurn, Memory, Task } from "@ai-todo/contracts";

export interface EmbeddingRecord {
  id?: number;
  itemId: string;
  itemType: "task" | "memory";
  content: string;
  vector: number[];
  provider: "transformers" | "fallback";
  updatedAt: string;
}

export interface SettingRecord {
  key: "activeStrategyId" | "agentEndpoint";
  value: string;
}

export class AITodoDB extends Dexie {
  tasks!: Table<Task, string>;
  conversation_turns!: Table<ConversationTurn, string>;
  memories!: Table<Memory, string>;
  embeddings!: Table<EmbeddingRecord, number>;
  settings!: Table<SettingRecord, string>;

  constructor(name = "ai-todo") {
    super(name);
    this.version(1).stores({
      tasks: "&id, status, strategyBucket, priority, updatedAt, *tags",
      conversation_turns: "&id, role, createdAt",
      memories: "&id, kind, category, salience, createdAt",
      embeddings: "++id, [itemId+itemType], itemId, itemType, updatedAt",
      settings: "&key",
    });
  }
}

export const createAppDatabase = (name?: string) => new AITodoDB(name);
export const db = createAppDatabase();
