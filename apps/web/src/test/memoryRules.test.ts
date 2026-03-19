import { describe, expect, it } from "vitest";
import { shouldPersistLongTermMemory } from "../agent/tools";

describe("shouldPersistLongTermMemory", () => {
  it("accepts salient patterns, lessons, and preferences", () => {
    expect(
      shouldPersistLongTermMemory({
        kind: "long_term",
        category: "pattern",
        summary: "大型公开活动临近时，先列负责人和物料清单能显著缓解焦虑。",
        sourceTurnIds: [],
        salience: 0.86,
      }),
    ).toBe(true);
  });

  it("rejects low-salience or underspecified facts", () => {
    expect(
      shouldPersistLongTermMemory({
        kind: "long_term",
        category: "fact",
        summary: "展会",
        sourceTurnIds: [],
        salience: 0.6,
      }),
    ).toBe(false);
  });
});
