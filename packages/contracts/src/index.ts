import { z } from "zod";

export const strategyIdSchema = z.enum(["gtd", "eisenhower", "deep-work"]);
export type StrategyId = z.infer<typeof strategyIdSchema>;

export const taskTypeSchema = z.enum(["task", "project"]);
export const taskStatusSchema = z.enum([
  "inbox",
  "next",
  "waiting",
  "done",
  "archived",
]);
export const taskPrioritySchema = z.enum(["low", "medium", "high"]);

export const taskSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  type: taskTypeSchema,
  status: taskStatusSchema,
  strategyBucket: z.string(),
  priority: taskPrioritySchema,
  dueAt: z.string().datetime().nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Task = z.infer<typeof taskSchema>;

export const taskCreateInputSchema = z.object({
  title: z.string().min(1),
  type: taskTypeSchema.default("task"),
  status: taskStatusSchema.default("inbox"),
  strategyBucket: z.string().optional(),
  priority: taskPrioritySchema.default("medium"),
  dueAt: z.string().datetime().nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
});
export type TaskCreateInput = z.infer<typeof taskCreateInputSchema>;

export const taskUpdateInputSchema = z.object({
  id: z.string(),
  title: z.string().min(1).optional(),
  type: taskTypeSchema.optional(),
  status: taskStatusSchema.optional(),
  strategyBucket: z.string().optional(),
  priority: taskPrioritySchema.optional(),
  dueAt: z.string().datetime().nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
});
export type TaskUpdateInput = z.infer<typeof taskUpdateInputSchema>;

export const memoryKindSchema = z.enum(["short_term", "long_term"]);
export const memoryCategorySchema = z.enum([
  "preference",
  "lesson",
  "pattern",
  "fact",
]);

export const memorySchema = z.object({
  id: z.string(),
  kind: memoryKindSchema,
  category: memoryCategorySchema,
  summary: z.string().min(1),
  sourceTurnIds: z.array(z.string()),
  salience: z.number().min(0).max(1),
  createdAt: z.string().datetime(),
});
export type Memory = z.infer<typeof memorySchema>;

export const privacyPolicySchema = z.object({
  version: z.literal("2026-03"),
  notes: z.string(),
  tags: z.string(),
  memories: z.string(),
  taskNoteCharLimit: z.number().int().positive(),
  memoryCharLimit: z.number().int().positive(),
  maxTagsPerTask: z.number().int().positive(),
});
export type PrivacyPolicy = z.infer<typeof privacyPolicySchema>;

export const taskContextSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  type: taskTypeSchema,
  status: taskStatusSchema,
  strategyBucket: z.string(),
  priority: taskPrioritySchema,
  dueAt: z.string().datetime().nullable().optional(),
  notesExcerpt: z.string().nullable().optional(),
  tags: z.array(z.string()).max(3),
  redactionFlags: z.array(z.string()).max(6),
});
export type TaskContext = z.infer<typeof taskContextSchema>;

export const memoryContextSchema = z.object({
  id: z.string(),
  category: memoryCategorySchema,
  salience: z.number().min(0).max(1),
  summary: z.string().min(1),
  redactionFlags: z.array(z.string()).max(4),
});
export type MemoryContext = z.infer<typeof memoryContextSchema>;

export const memoryInputSchema = z.object({
  kind: memoryKindSchema.default("long_term"),
  category: memoryCategorySchema,
  summary: z.string().min(1),
  sourceTurnIds: z.array(z.string()).default([]),
  salience: z.number().min(0).max(1).default(0.7),
});
export type MemoryInput = z.infer<typeof memoryInputSchema>;

export const conversationRoleSchema = z.enum(["user", "assistant", "system"]);
export const conversationTurnSchema = z.object({
  id: z.string(),
  role: conversationRoleSchema,
  content: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type ConversationTurn = z.infer<typeof conversationTurnSchema>;

export const toolNameSchema = z.enum([
  "batch_create_tasks",
  "update_tasks",
  "archive_tasks",
  "upsert_memory",
  "set_strategy",
]);

export const boardColumnSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
});

export const boardConfigSchema = z.object({
  mode: z.enum(["kanban", "quadrants", "focus"]),
  columns: z.array(boardColumnSchema),
});

export const strategyPluginSchema = z.object({
  id: strategyIdSchema,
  name: z.string(),
  systemPrompt: z.string(),
  retrievalHints: z.array(z.string()),
  toolPolicies: z.object({
    disallowedTools: z.array(toolNameSchema),
    emphasis: z.array(z.string()),
  }),
  boardConfig: boardConfigSchema,
});
export type StrategyPluginSnapshot = z.infer<typeof strategyPluginSchema>;

export const aiContextBundleSchema = z.object({
  userMessage: z.string().min(1),
  activeStrategy: strategyPluginSchema,
  privacyPolicy: privacyPolicySchema,
  recentTurns: z.array(conversationTurnSchema).max(10),
  retrievedTasks: z.array(taskContextSchema).max(10),
  retrievedMemories: z.array(memoryContextSchema).max(8),
  uiStateSnapshot: z.object({
    taskCounts: z.record(z.string(), z.number()),
    boardMode: z.enum(["kanban", "quadrants", "focus"]),
    isOnline: z.boolean(),
  }),
});
export type AIContextBundle = z.infer<typeof aiContextBundleSchema>;

const batchCreateTasksToolCallSchema = z.object({
  name: z.literal("batch_create_tasks"),
  reason: z.string().min(1),
  arguments: z.object({
    tasks: z.array(taskCreateInputSchema).min(1),
  }),
});

const updateTasksToolCallSchema = z.object({
  name: z.literal("update_tasks"),
  reason: z.string().min(1),
  arguments: z.object({
    updates: z.array(taskUpdateInputSchema).min(1),
  }),
});

const archiveTasksToolCallSchema = z.object({
  name: z.literal("archive_tasks"),
  reason: z.string().min(1),
  arguments: z.object({
    taskIds: z.array(z.string()).min(1),
  }),
});

const upsertMemoryToolCallSchema = z.object({
  name: z.literal("upsert_memory"),
  reason: z.string().min(1),
  arguments: z.object({
    memory: memoryInputSchema,
  }),
});

const setStrategyToolCallSchema = z.object({
  name: z.literal("set_strategy"),
  reason: z.string().min(1),
  arguments: z.object({
    strategyId: strategyIdSchema,
  }),
});

export const toolCallSchema = z.discriminatedUnion("name", [
  batchCreateTasksToolCallSchema,
  updateTasksToolCallSchema,
  archiveTasksToolCallSchema,
  upsertMemoryToolCallSchema,
  setStrategyToolCallSchema,
]);
export type ToolCall = z.infer<typeof toolCallSchema>;

export const agentResponseSchema = z.object({
  message: z.string().min(1),
  toolCalls: z.array(toolCallSchema),
});
export type AgentResponse = z.infer<typeof agentResponseSchema>;
