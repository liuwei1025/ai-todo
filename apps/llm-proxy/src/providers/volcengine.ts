import { agentResponseSchema, type AIContextBundle } from "@ai-todo/contracts";
import { buildPrompt } from "./prompt";
import { makeMockResponse } from "./mock";
import type { ProviderAdapter } from "./types";

const ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

export const createVolcengineAdapter = (): ProviderAdapter => {
  let didWarnMissingKey = false;

  return {
    id: "volcengine",
    isMockFallback: () => !process.env.ARK_API_KEY,
    respond: async (bundle: AIContextBundle) => {
      const apiKey = process.env.ARK_API_KEY;
      if (!apiKey) {
        if (!didWarnMissingKey) {
          console.warn(
            "[volcengine] ARK_API_KEY is not set — falling back to mock provider. " +
              "Set the key in .env to use Volcengine Ark inference.",
          );
          didWarnMissingKey = true;
        }
        return makeMockResponse(bundle);
      }

      const model = process.env.ARK_MODEL ?? "doubao-1.5-pro-256k-250115";
      const baseUrl = (
        process.env.ARK_BASE_URL ?? ARK_BASE_URL
      ).replace(/\/+$/, "");

      const response = await fetch(`${baseUrl}/chat/completions`, {
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
        const body = await response.text().catch(() => "");
        throw new Error(
          `Volcengine Ark error ${response.status}: ${body.slice(0, 200)}`,
        );
      }

      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("Volcengine Ark returned no content");
      }

      return agentResponseSchema.parse(JSON.parse(content));
    },
  };
};
