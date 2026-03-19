import type {
  AIContextBundle,
  Memory,
  MemoryContext,
  PrivacyPolicy,
  StrategyPluginSnapshot,
  Task,
  TaskContext,
} from "@ai-todo/contracts";
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

const TASK_NOTE_CHAR_LIMIT = 180;
const MEMORY_CHAR_LIMIT = 160;
const MAX_TAGS_PER_TASK = 3;

const SENSITIVE_PATTERNS = [
  /\bhttps?:\/\/\S+/gi,
  /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/gi,
  /(?<!\d)(?:\+?\d[\d\s-]{6,}\d)(?!\d)/g,
  /\b(?:sk|rk|pk|token|secret|password)[-_a-z0-9]{6,}\b/gi,
  /\b\d{6,}\b/g,
];

const PRIVACY_POLICY: PrivacyPolicy = {
  version: "2026-03",
  notes:
    "Only short task note excerpts are sent. Sensitive strings such as links, contacts, secrets, and long numeric identifiers are masked.",
  tags:
    "At most three low-risk tags are sent per task. Sensitive or opaque tags are masked before upload.",
  memories:
    "Only redacted memory summaries are sent. Source turn ids and raw memory records stay local.",
  taskNoteCharLimit: TASK_NOTE_CHAR_LIMIT,
  memoryCharLimit: MEMORY_CHAR_LIMIT,
  maxTagsPerTask: MAX_TAGS_PER_TASK,
};

const sanitizeFreeText = (
  value: string | null | undefined,
  maxLength: number,
): {
  text: string | null;
  flags: string[];
} => {
  if (!value) {
    return { text: null, flags: [] };
  }

  let sanitized = value.trim();
  const flags = new Set<string>();

  for (const pattern of SENSITIVE_PATTERNS) {
    const replaced = sanitized.replace(pattern, "[已隐藏]");
    if (replaced !== sanitized) {
      sanitized = replaced;
      flags.add("masked-sensitive-text");
    }
  }

  sanitized = sanitized.replace(/\s+/g, " ").trim();

  if (!sanitized) {
    flags.add("removed-empty-text");
    return { text: null, flags: Array.from(flags) };
  }

  if (sanitized.length > maxLength) {
    sanitized = `${sanitized.slice(0, maxLength).trim()}...`;
    flags.add("truncated-text");
  }

  return { text: sanitized, flags: Array.from(flags) };
};

const sanitizeTags = (tags: string[]): { tags: string[]; flags: string[] } => {
  const flags = new Set<string>();
  const cleaned = tags
    .map((tag) => sanitizeFreeText(tag, 24))
    .map((item) => {
      if (item.flags.length > 0) {
        flags.add("masked-tag");
      }
      return item.text;
    })
    .filter((tag): tag is string => Boolean(tag))
    .map((tag) => tag.toLowerCase())
    .slice(0, MAX_TAGS_PER_TASK);

  if (tags.length > MAX_TAGS_PER_TASK) {
    flags.add("truncated-tags");
  }

  return {
    tags: Array.from(new Set(cleaned)),
    flags: Array.from(flags),
  };
};

const toTaskContext = (task: Task): TaskContext => {
  const notes = sanitizeFreeText(task.notes, TASK_NOTE_CHAR_LIMIT);
  const tags = sanitizeTags(task.tags);

  return {
    id: task.id,
    title: task.title,
    type: task.type,
    status: task.status,
    strategyBucket: task.strategyBucket,
    priority: task.priority,
    dueAt: task.dueAt ?? null,
    notesExcerpt: notes.text,
    tags: tags.tags,
    redactionFlags: Array.from(new Set([...notes.flags, ...tags.flags])),
  };
};

const toMemoryContext = (memory: Memory): MemoryContext => {
  const summary = sanitizeFreeText(memory.summary, MEMORY_CHAR_LIMIT);

  return {
    id: memory.id,
    category: memory.category,
    salience: memory.salience,
    summary: summary.text ?? "该记忆包含敏感信息，已在发送前省略。",
    redactionFlags: summary.flags,
  };
};

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
    privacyPolicy: PRIVACY_POLICY,
    recentTurns,
    retrievedTasks: uniqueBy([...keywordTasks, ...vectorTasks])
      .slice(0, 10)
      .map(toTaskContext),
    retrievedMemories: uniqueBy([...keywordMemories, ...vectorMemories])
      .slice(0, 8)
      .map(toMemoryContext),
    uiStateSnapshot: {
      taskCounts,
      boardMode: activeStrategy.boardConfig.mode,
      isOnline,
    },
  };
};
