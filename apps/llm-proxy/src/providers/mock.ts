import type {
  AIContextBundle,
  AgentResponse,
  StrategyId,
} from "@ai-todo/contracts";
import type { ProviderAdapter } from "./types";

export const makeMockResponse = (bundle: AIContextBundle): AgentResponse => {
  const message = bundle.userMessage.trim();
  const lower = message.toLowerCase();

  if (lower.includes("切换") && lower.includes("gtd")) {
    return {
      message: "已切回 GTD 视图，我会用 Inbox、Next Actions 和 Projects 来整理接下来的动作。",
      toolCalls: [
        {
          name: "set_strategy",
          reason: "The user explicitly asked to switch into GTD mode.",
          arguments: { strategyId: "gtd" },
        },
      ],
    };
  }

  if (lower.includes("切换") && lower.includes("深度")) {
    return {
      message: "已切换到深度工作模式，我会优先保留少量高价值任务并弱化浅层杂务。",
      toolCalls: [
        {
          name: "set_strategy",
          reason: "The user explicitly asked to switch into deep work mode.",
          arguments: { strategyId: "deep-work" },
        },
      ],
    };
  }

  const strategyBucketByStrategy: Record<StrategyId, string[]> = {
    gtd: ["projects", "next-actions", "next-actions"],
    eisenhower: [
      "important-not-urgent",
      "important-urgent",
      "not-important-urgent",
    ],
    "deep-work": ["deep-focus", "supporting", "shallow-admin"],
  };

  const memorySignal = bundle.retrievedMemories[0]?.summary;
  const [projectBucket, actionBucket, adminBucket] =
    strategyBucketByStrategy[bundle.activeStrategy.id];

  if (lower.includes("展会")) {
    return {
      message: memorySignal
        ? `我把展会项目拆成了一个项目和两条动作，并参考了这条记忆：${memorySignal}`
        : "我把展会项目拆成了一个项目和两条动作，先让焦虑转成清晰的下一步。",
      toolCalls: [
        {
          name: "batch_create_tasks",
          reason: "Break the event anxiety into a concrete project with next actions.",
          arguments: {
            tasks: [
              {
                title: "下周展会项目总控",
                type: "project",
                status: "inbox",
                strategyBucket: projectBucket,
                priority: "high",
                notes: "统筹 booth、物料、人员、节奏和彩排。",
                tags: ["展会", "项目"],
              },
              {
                title: "列出展会 booth 与物料清单",
                type: "task",
                status: "next",
                strategyBucket: actionBucket,
                priority: "high",
                notes: "把印刷品、样机、电源、备用件逐项确认。",
                tags: ["展会", "物料"],
              },
              {
                title: "确认展会现场负责人与到场时间",
                type: "task",
                status: "next",
                strategyBucket: adminBucket,
                priority: "medium",
                notes: "补齐负责人与场地协调信息，降低临场失控感。",
                tags: ["展会", "排期"],
              },
            ],
          },
        },
        {
          name: "upsert_memory",
          reason: "Capture the recurring pattern that event preparation triggers anxiety.",
          arguments: {
            memory: {
              kind: "long_term",
              category: "pattern",
              summary: "大型展会或公开活动临近时，用户会因为准备项分散而焦虑，先列清单和负责人能显著缓解压力。",
              sourceTurnIds: [],
              salience: 0.84,
            },
          },
        },
      ],
    };
  }

  return {
    message:
      "我已经理解你的输入。下一步我会优先把它转成更清晰的任务，并尽量保留可执行的下一步动作。",
    toolCalls: [
      {
        name: "batch_create_tasks",
        reason: "Turn the user's freeform request into a single actionable capture.",
        arguments: {
          tasks: [
            {
              title: message,
              type: "task",
              status: "inbox",
              strategyBucket: actionBucket,
              priority: "medium",
              notes: "Captured from natural language input.",
              tags: ["inbox"],
            },
          ],
        },
      },
    ],
  };
};

export const createMockAdapter = (): ProviderAdapter => ({
  id: "mock",
  respond: async (bundle) => makeMockResponse(bundle),
});
