import { describe, expect, it } from "vitest";
import { getStrategyShowcasePreset } from "../mock/strategyShowcase";
import { defaultBucketForTask, strategyList } from "../strategies";

describe("strategy plugins", () => {
  it("ships the three built-in strategy plugins", () => {
    expect(strategyList.map((strategy) => strategy.id)).toEqual([
      "gtd",
      "eisenhower",
      "deep-work",
    ]);
  });

  it("derives sensible default buckets", () => {
    expect(
      defaultBucketForTask("gtd", {
        title: "Plan expo",
        type: "project",
        status: "inbox",
        priority: "high",
        tags: [],
      }),
    ).toBe("projects");

    expect(
      defaultBucketForTask("deep-work", {
        title: "Write strategy memo",
        type: "task",
        status: "next",
        priority: "high",
        tags: [],
      }),
    ).toBe("deep-focus");
  });

  it("ships showcase data that covers every strategy column", () => {
    for (const strategy of strategyList) {
      const preset = getStrategyShowcasePreset(strategy.id);
      const coveredBuckets = new Set(
        preset.tasks.map((task) => task.strategyBucket).filter(Boolean),
      );

      expect(coveredBuckets).toEqual(
        new Set(strategy.boardConfig.columns.map((column) => column.id)),
      );
    }
  });
});
