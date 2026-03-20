import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { StrategyId, Task, TaskCreateInput } from "@ai-todo/contracts";
import { TaskListView } from "../components/TaskListView";
import { getStrategyShowcasePreset } from "../mock/strategyShowcase";
import { getStrategyPlugin } from "../strategies";

const noop = async () => undefined;

afterEach(() => {
  cleanup();
});

const buildTask = (input: TaskCreateInput, index: number): Task => ({
  id: `task-${index + 1}`,
  title: input.title,
  type: input.type ?? "task",
  status: input.status ?? "inbox",
  strategyBucket: input.strategyBucket ?? "inbox",
  priority: input.priority ?? "medium",
  dueAt: input.dueAt ?? null,
  notes: input.notes ?? null,
  tags: input.tags ?? [],
  createdAt: `2026-03-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
  updatedAt: `2026-03-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
});

const renderStrategy = (strategyId: StrategyId) => {
  const preset = getStrategyShowcasePreset(strategyId);
  const tasks = preset.tasks.map(buildTask);

  render(
    <TaskListView
      tasks={tasks}
      strategy={getStrategyPlugin(strategyId)}
      onCompleteTask={noop}
      onArchiveTask={noop}
      onRememberTask={noop}
      onUpdateTask={noop}
    />,
  );

  return {
    preset,
    tasks,
    listView: screen.getByTestId("task-list-view"),
  };
};

describe("TaskListView", () => {
  it("renders GTD structure with strategy summary and grouped columns", () => {
    const { listView } = renderStrategy("gtd");

    expect(screen.getByText("先澄清，再推进")).toBeInTheDocument();
    expect(screen.getByText("进行中 9")).toBeInTheDocument();
    expect(
      within(listView).getByRole("heading", { level: 3, name: "收件箱" }),
    ).toBeInTheDocument();
    expect(
      within(listView).getByRole("heading", { level: 3, name: "下一步行动" }),
    ).toBeInTheDocument();
    expect(
      within(listView).getByRole("heading", { level: 3, name: "项目" }),
    ).toBeInTheDocument();
  });

  it("renders Eisenhower quadrants with all priority buckets visible", () => {
    const { listView } = renderStrategy("eisenhower");

    expect(screen.getByText("先判断轻重缓急")).toBeInTheDocument();
    expect(within(listView).getByText("X = 紧急")).toBeInTheDocument();
    expect(within(listView).getByText("X = 不紧急")).toBeInTheDocument();
    expect(within(listView).getByText("Y = 重要")).toBeInTheDocument();
    expect(within(listView).getByText("Y = 不重要")).toBeInTheDocument();
    expect(
      within(listView).getByRole("heading", { level: 3, name: "立即处理" }),
    ).toBeInTheDocument();
    expect(
      within(listView).getByRole("heading", { level: 3, name: "计划安排" }),
    ).toBeInTheDocument();
    expect(
      within(listView).getByRole("heading", { level: 3, name: "委派或限制" }),
    ).toBeInTheDocument();
    expect(
      within(listView).getByRole("heading", { level: 3, name: "放弃或搁置" }),
    ).toBeInTheDocument();
    expect(within(listView).getByText("坐标: 重要 × 紧急")).toBeInTheDocument();
    expect(within(listView).getByText("坐标: 不重要 × 不紧急")).toBeInTheDocument();
  });

  it("renders Deep Work focus zones and keeps shallow work collapsed by default", () => {
    const { listView } = renderStrategy("deep-work");

    expect(screen.getByText("优先保护专注区块")).toBeInTheDocument();
    expect(
      within(listView).getByRole("heading", { level: 3, name: "深度专注" }),
    ).toBeInTheDocument();
    expect(
      within(listView).getByRole("heading", { level: 3, name: "支撑性工作" }),
    ).toBeInTheDocument();
    expect(
      within(listView).getByRole("heading", { level: 3, name: "浅层事务" }),
    ).toBeInTheDocument();
    expect(within(listView).getByRole("button", { name: "展开 (3)" })).toBeInTheDocument();
    expect(
      within(listView).queryByText("报销本周差旅费用"),
    ).not.toBeInTheDocument();
  });
});
