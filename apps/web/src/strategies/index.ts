import type {
  StrategyId,
  StrategyPluginSnapshot,
  TaskCreateInput,
} from "@ai-todo/contracts";

const strategyPlugins: Record<StrategyId, StrategyPluginSnapshot> = {
  gtd: {
    id: "gtd",
    name: "GTD",
    systemPrompt:
      "你是一位冷静的事务统筹助手，运行在 GTD 模式下。请帮助用户清空脑中负担，澄清下一步可执行动作，保持项目可见，并避免模糊任务。",
    retrievalHints: [
      "优先识别项目、受阻事项以及能降低焦虑的既往经验。",
      "相比抽象目标，优先输出明确的下一步行动。",
    ],
    toolPolicies: {
      disallowedTools: [],
      emphasis: ["澄清下一步行动", "让收件箱保持可执行"],
    },
    boardConfig: {
      mode: "kanban",
      columns: [
        { id: "inbox", label: "收件箱", description: "等待澄清的原始记录" },
        {
          id: "next-actions",
          label: "下一步行动",
          description: "明确且可执行的动作",
        },
        {
          id: "projects",
          label: "项目",
          description: "需要多步推进的结果",
        },
      ],
    },
  },
  eisenhower: {
    id: "eisenhower",
    name: "艾森豪威尔",
    systemPrompt:
      "你是一位果断的事务统筹助手，使用艾森豪威尔矩阵管理任务。请按紧急度与重要度分类，并避免收集无关琐事。",
    retrievalHints: [
      "优先识别带有截止时间、杠杆效应或风险的任务。",
      "避免让低价值杂务占据看板主导位置。",
    ],
    toolPolicies: {
      disallowedTools: [],
      emphasis: ["按轻重缓急分类", "质疑低价值工作"],
    },
    boardConfig: {
      mode: "quadrants",
      columns: [
        { id: "important-urgent", label: "立即处理" },
        { id: "important-not-urgent", label: "计划安排" },
        { id: "not-important-urgent", label: "委派或限制" },
        { id: "not-important-not-urgent", label: "放弃或搁置" },
      ],
    },
  },
  "deep-work": {
    id: "deep-work",
    name: "深度工作",
    systemPrompt:
      "你是一位以专注为核心的事务统筹助手。请保护不被打断的工作时段，把浅层事务与专注区块分开，并只推荐少量高价值目标。",
    retrievalHints: [
      "优先识别认知负荷高的工作、过往专注模式和精力节奏。",
      "当响应式行政杂务与深度工作冲突时，降低前者优先级。",
    ],
    toolPolicies: {
      disallowedTools: [],
      emphasis: ["突出值得专注的工作", "减少浅层任务噪音"],
    },
    boardConfig: {
      mode: "focus",
      columns: [
        { id: "deep-focus", label: "深度专注" },
        { id: "supporting", label: "支撑性工作" },
        { id: "shallow-admin", label: "浅层事务" },
      ],
    },
  },
};

export const strategyList = Object.values(strategyPlugins);

export const getStrategyPlugin = (id: StrategyId) => strategyPlugins[id];

export const defaultBucketForTask = (
  strategyId: StrategyId,
  input: TaskCreateInput,
) => {
  if (input.strategyBucket) {
    return input.strategyBucket;
  }

  if (strategyId === "gtd") {
    if (input.type === "project") {
      return "projects";
    }
    if (input.status === "next") {
      return "next-actions";
    }
    return "inbox";
  }

  if (strategyId === "deep-work") {
    if (input.priority === "high" || input.type === "project") {
      return "deep-focus";
    }
    if (input.priority === "low") {
      return "shallow-admin";
    }
    return "supporting";
  }

  if (input.priority === "high") {
    return "important-urgent";
  }
  if (input.dueAt) {
    return "important-not-urgent";
  }
  if (input.priority === "low") {
    return "not-important-not-urgent";
  }
  return "not-important-urgent";
};
