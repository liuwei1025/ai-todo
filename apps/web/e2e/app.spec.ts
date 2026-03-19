import { test, expect } from "@playwright/test";

const mockAgentResponse = {
  message: "我已经把展会拆成项目和动作，并提取了一条稳定记忆。",
  toolCalls: [
    {
      name: "batch_create_tasks",
      reason: "Create a project and next actions.",
      arguments: {
        tasks: [
          {
            title: "下周展会项目总控",
            type: "project",
            status: "inbox",
            strategyBucket: "projects",
            priority: "high",
            notes: "统筹 booth、物料和人员。",
            tags: ["展会"],
          },
          {
            title: "确认 booth 物料清单",
            type: "task",
            status: "next",
            strategyBucket: "next-actions",
            priority: "high",
            notes: "逐项确认印刷品和设备。",
            tags: ["展会", "物料"],
          },
        ],
      },
    },
    {
      name: "upsert_memory",
      reason: "Remember the pattern.",
      arguments: {
        memory: {
          kind: "long_term",
          category: "pattern",
          summary: "展会临近时，先拆物料和负责人能显著降低焦虑。",
          sourceTurnIds: [],
          salience: 0.85,
        },
      },
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route("http://localhost:8787/agent/respond", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockAgentResponse),
    });
  });
  await page.goto("/");
});

test("creates tasks from natural language", async ({ page }) => {
  await page
    .getByPlaceholder("例如：帮我把展会项目拆成可执行的下一步行动")
    .fill("帮我理一下下周那个重要的展会项目，我总觉得心慌。");
  await page.getByRole("button", { name: "发送给智能体" }).click();

  await expect(page.getByText("下周展会项目总控")).toBeVisible();
  await expect(page.getByText("确认 booth 物料清单")).toBeVisible();
});

test("switches boards when GTD changes to Eisenhower", async ({ page }) => {
  await page.locator('.rail-strategy-button[aria-label="艾森豪威尔"]').click();
  await expect(page.getByText("立即处理")).toBeVisible();
  await expect(page.getByText("计划安排")).toBeVisible();
});

test("switches boards when entering deep work mode", async ({ page }) => {
  await page.locator('.rail-strategy-button[aria-label="深度工作"]').click();
  await expect(page.getByRole("button", { name: "开始 25 分钟专注" })).toBeVisible();
  await expect(page.getByText("深度专注")).toBeVisible();
});

test("surfaces retrieved memory after an agent round-trip", async ({ page }) => {
  await page
    .getByPlaceholder("例如：帮我把展会项目拆成可执行的下一步行动")
    .fill("帮我理一下展会项目");
  await page.getByRole("button", { name: "发送给智能体" }).click();

  await expect(
    page.getByText("展会临近时，先拆物料和负责人能显著降低焦虑。"),
  ).toBeVisible();
});

test("persists local data across reload", async ({ page }) => {
  await page
    .getByPlaceholder("例如：帮我把展会项目拆成可执行的下一步行动")
    .fill("帮我理一下展会项目");
  await page.getByRole("button", { name: "发送给智能体" }).click();
  await expect(page.getByText("下周展会项目总控")).toBeVisible();

  await page.reload();
  await expect(page.getByText("下周展会项目总控")).toBeVisible();
});
