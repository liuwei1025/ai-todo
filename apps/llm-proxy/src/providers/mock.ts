import type {
  AIContextBundle,
  AgentResponse,
  StrategyId,
} from "@ai-todo/contracts";
import type { ProviderAdapter } from "./types";

const includesAny = (message: string, fragments: string[]) =>
  fragments.some((fragment) => message.includes(fragment));

const TASK_CAPTURE_CUES = [
  "todo",
  "待办",
  "任务",
  "项目",
  "提醒",
  "记一下",
  "记个",
  "记录",
  "加到",
  "加入",
  "安排",
  "规划",
  "计划",
  "拆解",
  "拆成",
  "梳理",
  "整理",
  "理一下",
  "跟进",
  "下一步",
];

const UNSUPPORTED_MUTATION_CUES = [
  "更新",
  "修改",
  "改成",
  "完成",
  "归档",
  "删除",
  "删掉",
];

const CHAT_ONLY_CUES = [
  "你好",
  "hello",
  "hi",
  "早上好",
  "晚上好",
  "晚安",
  "谢谢",
  "哈哈",
  "在吗",
  "你是谁",
  "怎么样",
];

const isExplicitTaskIntent = (message: string) =>
  includesAny(message, TASK_CAPTURE_CUES);

const isChatOnly = (rawMessage: string, normalizedMessage: string) => {
  if (isExplicitTaskIntent(normalizedMessage)) {
    return false;
  }

  if (includesAny(normalizedMessage, CHAT_ONLY_CUES)) {
    return true;
  }

  if (/[?？]/.test(rawMessage)) {
    return true;
  }

  return normalizedMessage.length <= 12;
};

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

  if (isChatOnly(message, lower)) {
    return {
      message:
        "我理解了这条输入，但它现在更像闲聊或普通问答，不会自动写入待办。若你要我记录或整理任务，请直接说明要新增、拆解或调整什么。",
      toolCalls: [],
    };
  }

  if (includesAny(lower, UNSUPPORTED_MUTATION_CUES) && !isExplicitTaskIntent(lower)) {
    return {
      message:
        "我看到了你想改动已有任务的意思，但当前 mock 兜底只会在明确的新增或拆解意图下写入任务。若要修改现有任务，请在面板里直接编辑，或把目标任务说得更具体一些。",
      toolCalls: [],
    };
  }

  if (lower.includes("展会") && isExplicitTaskIntent(lower)) {
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

  if (isExplicitTaskIntent(lower)) {
    return {
      message:
        "我把这条输入识别为待办意图，先按当前策略收进任务系统；如果你愿意，我下一轮可以继续帮你拆成更细的下一步行动。",
      toolCalls: [
        {
          name: "batch_create_tasks",
          reason: "Capture the user's explicit task-management request.",
          arguments: {
            tasks: [
              {
                title: message,
                type: "task",
                status: "inbox",
                strategyBucket: actionBucket,
                priority: "medium",
                notes: "Captured from an explicit task-management request.",
                tags: ["inbox"],
              },
            ],
          },
        },
      ],
    };
  }

  return {
    message:
      "我已经理解你的输入，但它没有明确要求我执行待办操作，所以这次不会自动创建任务。若你想让我落成 todo，请直接说“记一下”或“帮我拆成下一步行动”。",
    toolCalls: [],
  };
};

export const createMockAdapter = (): ProviderAdapter => ({
  id: "mock",
  respond: async (bundle) => makeMockResponse(bundle),
});
