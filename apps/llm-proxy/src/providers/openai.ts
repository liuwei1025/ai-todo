import { agentResponseSchema, type AIContextBundle } from "@ai-todo/contracts";
import { buildPrompt } from "./prompt";
import { makeMockResponse } from "./mock";
import type { ProviderAdapter } from "./types";

export const createOpenAIAdapter = (): ProviderAdapter => ({
  id: "openai",
  respond: async (bundle: AIContextBundle) => {
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
  },
});
