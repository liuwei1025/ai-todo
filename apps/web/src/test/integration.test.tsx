import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { createRepositories } from "../db/repositories";
import { createTestDatabase, MockEmbeddingClient } from "./testUtils";
import type { AIContextBundle, AgentResponse } from "@ai-todo/contracts";

afterEach(async () => {
  cleanup();
});

describe("app integration", () => {
  it("retrieves memory, executes tool calls, and refreshes the board", async () => {
    const database = createTestDatabase();
    const repositories = createRepositories(database);
    const embeddingClient = new MockEmbeddingClient();

    await repositories.settings.ensureDefaults();
    const seededMemory = await repositories.memories.upsert({
      kind: "long_term",
      category: "lesson",
      summary: "去年展会失败的教训是物料负责人没有提前锁定，导致现场混乱。",
      sourceTurnIds: [],
      salience: 0.92,
    });
    const embedding = await embeddingClient.embedText(seededMemory.summary);
    await repositories.embeddings.put({
      itemId: seededMemory.id,
      itemType: "memory",
      content: seededMemory.summary,
      vector: embedding.vector,
      provider: embedding.provider,
      updatedAt: seededMemory.createdAt,
    });

    let capturedBundle: AIContextBundle | null = null;
    const agentClient = async (bundle: AIContextBundle): Promise<AgentResponse> => {
      capturedBundle = bundle;
      return {
        message: "我已经拆好了展会项目，并记下了这类活动会引发焦虑的规律。",
        toolCalls: [
          {
            name: "batch_create_tasks",
            reason: "Create a project and a next action.",
            arguments: {
              tasks: [
                {
                  title: "下周展会项目总控",
                  type: "project",
                  status: "inbox",
                  strategyBucket: "projects",
                  priority: "high",
                  notes: "统一协调展会执行。",
                  tags: ["展会"],
                },
                {
                  title: "确认展会 booth 物料清单",
                  type: "task",
                  status: "next",
                  strategyBucket: "next-actions",
                  priority: "high",
                  notes: "补齐清单并锁定负责人。",
                  tags: ["展会", "物料"],
                },
              ],
            },
          },
          {
            name: "upsert_memory",
            reason: "Store a reusable operating lesson.",
            arguments: {
              memory: {
                kind: "long_term",
                category: "pattern",
                summary: "展会类项目会让用户因为物料和负责人不清晰而焦虑，先拆清单再对人可以显著降压。",
                sourceTurnIds: [],
                salience: 0.88,
              },
            },
          },
        ],
      };
    };

    render(
      <App
        database={database}
        agentClient={agentClient}
        embeddingClient={embeddingClient}
      />,
    );

    const input = screen.getByPlaceholderText(
      "例如：帮我把展会项目拆成可执行的下一步行动",
    );
    await userEvent.type(input, "帮我理一下下周那个重要的展会项目，我总觉得心慌。");
    await userEvent.click(screen.getByRole("button", { name: "发送给智能体" }));

    await waitFor(() => {
      expect(screen.getByText("下周展会项目总控")).toBeInTheDocument();
    });

    expect(
      screen.getByText("确认展会 booth 物料清单"),
    ).toBeInTheDocument();
    expect(capturedBundle?.retrievedMemories[0]?.summary).toContain("去年展会失败的教训");
    await waitFor(() => {
      expect(
        screen.getByText("展会类项目会让用户因为物料和负责人不清晰而焦虑，先拆清单再对人可以显著降压。"),
      ).toBeInTheDocument();
    });

    const taskRow = screen
      .getByText("确认展会 booth 物料清单")
      .closest(".task-row");
    expect(taskRow).not.toBeNull();

    await userEvent.click(within(taskRow as HTMLElement).getByRole("button", { name: "编辑" }));
    await userEvent.selectOptions(
      within(taskRow as HTMLElement).getByLabelText("状态"),
      "waiting",
    );
    await userEvent.selectOptions(
      within(taskRow as HTMLElement).getByLabelText("优先级"),
      "low",
    );
    await userEvent.type(
      within(taskRow as HTMLElement).getByLabelText("截止日期"),
      "2026-04-20",
    );
    await userEvent.clear(within(taskRow as HTMLElement).getByLabelText("任务备注"));
    await userEvent.type(
      within(taskRow as HTMLElement).getByLabelText("任务备注"),
      "已联系主办方，等待 booth 尺寸确认。",
    );
    await userEvent.click(
      within(taskRow as HTMLElement).getByRole("button", { name: "保存备注" }),
    );

    await waitFor(() => {
      expect(
        screen.getAllByText("已联系主办方，等待 booth 尺寸确认。").length,
      ).toBeGreaterThan(0);
    });
    expect(
      within(taskRow as HTMLElement).getByLabelText("状态"),
    ).toHaveValue("waiting");
    expect(
      within(taskRow as HTMLElement).getByLabelText("优先级"),
    ).toHaveValue("low");

    cleanup();

    render(
      <App
        database={database}
        agentClient={agentClient}
        embeddingClient={embeddingClient}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getAllByText("已联系主办方，等待 booth 尺寸确认。").length,
      ).toBeGreaterThan(0);
    });
  });

  it("persists local settings edits", async () => {
    const database = createTestDatabase();
    const repositories = createRepositories(database);
    const embeddingClient = new MockEmbeddingClient();

    await repositories.settings.ensureDefaults();

    render(
      <App
        database={database}
        agentClient={async () => ({ message: "noop", toolCalls: [] })}
        embeddingClient={embeddingClient}
      />,
    );

    const endpointInput = screen.getByLabelText("Agent Proxy Endpoint");
    await userEvent.clear(endpointInput);
    await userEvent.type(endpointInput, "http://localhost:9001");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(screen.getByText("已保存到本地设置。")).toBeInTheDocument();
    });
    const endpoint = await repositories.settings.get("agentEndpoint");
    expect(endpoint?.value).toBe("http://localhost:9001");
  });

  it("does not create tasks when the agent decides no todo action is needed", async () => {
    const database = createTestDatabase();
    const repositories = createRepositories(database);
    const embeddingClient = new MockEmbeddingClient();

    await repositories.settings.ensureDefaults();

    render(
      <App
        database={database}
        agentClient={async () => ({
          message: "这条更像闲聊，我先不写入待办。若你要记录任务，请直接说明要新增或拆解什么。",
          toolCalls: [],
        })}
        embeddingClient={embeddingClient}
      />,
    );

    await userEvent.type(
      screen.getByPlaceholderText("例如：帮我把展会项目拆成可执行的下一步行动"),
      "哈哈今天脑子有点乱，先随便聊一句。",
    );
    await userEvent.click(screen.getByRole("button", { name: "发送给智能体" }));

    await waitFor(() => {
      expect(
        screen.getAllByText("这条更像闲聊，我先不写入待办。若你要记录任务，请直接说明要新增或拆解什么。").length,
      ).toBeGreaterThan(0);
    });

    expect(
      screen.getByText("列表里还没有可展示的任务。"),
    ).toBeInTheDocument();
    const tasks = await repositories.tasks.listAll();
    expect(tasks).toHaveLength(0);
  });

  it("loads strategy showcase mock data into the list", async () => {
    const database = createTestDatabase();
    const repositories = createRepositories(database);
    const embeddingClient = new MockEmbeddingClient();

    await repositories.settings.ensureDefaults();

    render(
      <App
        database={database}
        agentClient={async () => ({ message: "noop", toolCalls: [] })}
        embeddingClient={embeddingClient}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "面板" }));
    await userEvent.click(
      screen.getByRole("button", { name: "载入 深度工作示例" }),
    );

    await waitFor(() => {
      expect(screen.getByText("撰写 AI TODO 策略评估文档")).toBeInTheDocument();
    });

    expect(screen.getByText("当前策略: 深度工作")).toBeInTheDocument();
    expect(screen.getByText(/已载入 深度工作示例/)).toBeInTheDocument();
  });
});
