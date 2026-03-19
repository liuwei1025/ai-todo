import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import {
  agentResponseSchema,
  aiContextBundleSchema,
  type AIContextBundle,
  type AgentResponse,
  type StrategyId,
} from "@ai-todo/contracts";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const provider = process.env.LLM_PROVIDER ?? "mock";
const port = Number(process.env.PORT ?? 8787);

const summarizeContext = (bundle: AIContextBundle) => ({
  strategyId: bundle.activeStrategy.id,
  recentTurnCount: bundle.recentTurns.length,
  retrievedTaskCount: bundle.retrievedTasks.length,
  retrievedMemoryCount: bundle.retrievedMemories.length,
});

const makeMockResponse = (bundle: AIContextBundle): AgentResponse => {
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
              sourceTurnIds: bundle.recentTurns.slice(-2).map((turn) => turn.id),
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

const buildPrompt = (bundle: AIContextBundle) => {
  return [
    bundle.activeStrategy.systemPrompt,
    "Return valid JSON that matches this shape exactly:",
    JSON.stringify({
      message: "string",
      toolCalls: [
        {
          name: "batch_create_tasks | update_tasks | archive_tasks | upsert_memory | set_strategy",
          reason: "string",
          arguments: {},
        },
      ],
    }),
    "Context bundle:",
    JSON.stringify(bundle),
  ].join("\n\n");
};

const callOpenAI = async (bundle: AIContextBundle): Promise<AgentResponse> => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return makeMockResponse(bundle);
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a privacy-preserving chief of staff. Output only valid JSON. Never include markdown fences.",
        },
        {
          role: "user",
          content: buildPrompt(bundle),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI error ${response.status}`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned no content");
  }

  return agentResponseSchema.parse(JSON.parse(content));
};

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    provider,
  });
});

app.post("/agent/respond", async (request, response) => {
  try {
    const bundle = aiContextBundleSchema.parse(request.body);
    console.info("agent.respond", summarizeContext(bundle));
    const result =
      provider === "mock" ? makeMockResponse(bundle) : await callOpenAI(bundle);
    response.json(agentResponseSchema.parse(result));
  } catch (reason) {
    const message =
      reason instanceof Error ? reason.message : "Unknown proxy failure";
    response.status(500).json({
      message,
      toolCalls: [],
    });
  }
});

app.listen(port, () => {
  console.info(`AI TODO proxy listening on http://localhost:${port}`);
});
