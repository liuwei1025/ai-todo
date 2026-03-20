import assert from "node:assert/strict";
import test from "node:test";
import type { AIContextBundle } from "@ai-todo/contracts";
import { makeMockResponse } from "./mock";

const makeBundle = (userMessage: string): AIContextBundle => ({
  userMessage,
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
});

test("mock provider keeps casual chat out of todo actions", () => {
  const response = makeMockResponse(makeBundle("哈哈今天先随便聊聊"));

  assert.equal(response.toolCalls.length, 0);
  assert.match(response.message, /闲聊|待办/);
});

test("mock provider still captures explicit task requests", () => {
  const response = makeMockResponse(makeBundle("帮我记一下明天给张三发邮件"));

  assert.equal(response.toolCalls.length, 1);
  assert.equal(response.toolCalls[0]?.name, "batch_create_tasks");
});
