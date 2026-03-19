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
});
