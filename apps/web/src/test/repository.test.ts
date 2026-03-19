import { afterEach, describe, expect, it } from "vitest";
import { createRepositories } from "../db/repositories";
import { createTestDatabase } from "./testUtils";

const databases: Array<ReturnType<typeof createTestDatabase>> = [];

afterEach(async () => {
  await Promise.all(
    databases.map(async (database) => {
      await database.delete();
    }),
  );
  databases.length = 0;
});

describe("repositories", () => {
  it("seeds defaults without overwriting a chosen strategy", async () => {
    const database = createTestDatabase();
    databases.push(database);
    const repositories = createRepositories(database);

    await repositories.settings.set("activeStrategyId", "deep-work");
    await repositories.settings.ensureDefaults();

    const strategy = await repositories.settings.get("activeStrategyId");
    const endpoint = await repositories.settings.get("agentEndpoint");

    expect(strategy?.value).toBe("deep-work");
    expect(endpoint?.value).toBe("http://localhost:8787");
  });

  it("trims conversation history to the latest 10 turns", async () => {
    const database = createTestDatabase();
    databases.push(database);
    const repositories = createRepositories(database);

    for (let index = 0; index < 12; index += 1) {
      await repositories.turns.add("user", `turn ${index}`);
    }

    const turns = await repositories.turns.listRecent(20);
    expect(turns).toHaveLength(10);
    expect(turns[0]?.content).toBe("turn 2");
    expect(turns[9]?.content).toBe("turn 11");
  });

  it("upserts memories by summary and category", async () => {
    const database = createTestDatabase();
    databases.push(database);
    const repositories = createRepositories(database);

    const first = await repositories.memories.upsert({
      kind: "long_term",
      category: "pattern",
      summary: "Friday afternoons are low energy.",
      sourceTurnIds: ["a"],
      salience: 0.65,
    });
    const second = await repositories.memories.upsert({
      kind: "long_term",
      category: "pattern",
      summary: "Friday afternoons are low energy.",
      sourceTurnIds: ["b"],
      salience: 0.9,
    });

    const memories = await repositories.memories.listAll();
    expect(memories).toHaveLength(1);
    expect(second.id).toBe(first.id);
    expect(memories[0]?.sourceTurnIds).toEqual(["a", "b"]);
    expect(memories[0]?.salience).toBe(0.9);
  });

  it("updates a single task and supports memory curation actions", async () => {
    const database = createTestDatabase();
    databases.push(database);
    const repositories = createRepositories(database);

    const [task] = await repositories.tasks.batchCreate(
      [
        {
          title: "准备展会物料",
          type: "task",
          status: "inbox",
          strategyBucket: "inbox",
          priority: "medium",
          notes: null,
          tags: ["展会"],
        },
      ],
      "inbox",
    );

    const updatedTask = await repositories.tasks.updateOne(task.id, {
      status: "next",
      priority: "high",
      notes: "先确认清单和负责人。",
    });

    expect(updatedTask?.status).toBe("next");
    expect(updatedTask?.priority).toBe("high");
    expect(updatedTask?.notes).toBe("先确认清单和负责人。");

    const memory = await repositories.memories.upsert({
      kind: "long_term",
      category: "lesson",
      summary: "展会筹备需要先锁定负责人。",
      sourceTurnIds: [],
      salience: 0.8,
    });

    const lowered = await repositories.memories.updateSalience(memory.id, 0.45);
    expect(lowered?.salience).toBe(0.45);

    await repositories.memories.remove(memory.id);
    const memories = await repositories.memories.listAll();
    expect(memories).toHaveLength(0);
  });
});
