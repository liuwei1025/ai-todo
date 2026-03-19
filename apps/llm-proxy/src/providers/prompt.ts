import type { AIContextBundle } from "@ai-todo/contracts";

export const buildPrompt = (bundle: AIContextBundle) =>
  [
    bundle.activeStrategy.systemPrompt,
    `Privacy policy: ${JSON.stringify(bundle.privacyPolicy)}`,
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
