import assert from "node:assert/strict";
import test from "node:test";
import type { AIContextBundle } from "@ai-todo/contracts";
import { buildPrompt } from "./prompt";

const bundle: AIContextBundle = {
  userMessage: "只是随便聊聊，不要记任务。",
  activeStrategy: {
    id: "gtd",
    name: "GTD",
    systemPrompt: "你是任务整理助手。",
    retrievalHints: [],
    toolPolicies: {
      disallowedTools: [],
      emphasis: [],
    },
    boardConfig: {
      mode: "kanban",
      columns: [
        { id: "inbox", label: "收件箱" },
        { id: "next-actions", label: "下一步行动" },
        { id: "projects", label: "项目" },
      ],
    },
  },
  privacyPolicy: {
    version: "2026-03",
    notes: "redacted",
    tags: "redacted",
    memories: "redacted",
    taskNoteCharLimit: 180,
    memoryCharLimit: 240,
    maxTagsPerTask: 3,
  },
  recentTurns: [],
  retrievedTasks: [],
  retrievedMemories: [],
  uiStateSnapshot: {
    taskCounts: {},
    boardMode: "kanban",
    isOnline: true,
  },
};

test("prompt includes non-todo decision policy", () => {
  const prompt = buildPrompt(bundle);

  assert.match(prompt, /Decision policy/);
  assert.match(prompt, /casual chat/);
  assert.match(prompt, /toolCalls": \[\]/);
});
