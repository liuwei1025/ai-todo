import { describe, expect, it } from "vitest";
import { agentResponseSchema } from "@ai-todo/contracts";

describe("tool schemas", () => {
  it("accepts a valid agent response", () => {
    const result = agentResponseSchema.parse({
      message: "Created a task.",
      toolCalls: [
        {
          name: "batch_create_tasks",
          reason: "Capture the task.",
          arguments: {
            tasks: [
              {
                title: "Write expo checklist",
                type: "task",
                status: "next",
                strategyBucket: "next-actions",
                priority: "high",
                tags: ["expo"],
              },
            ],
          },
        },
      ],
    });

    expect(result.toolCalls).toHaveLength(1);
  });

  it("rejects invalid tool payloads", () => {
    expect(() =>
      agentResponseSchema.parse({
        message: "Bad payload",
        toolCalls: [
          {
            name: "archive_tasks",
            reason: "Archive something",
            arguments: {
              tasks: [],
            },
          },
        ],
      }),
    ).toThrow();
  });
});
