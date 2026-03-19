import {
  agentResponseSchema,
  type AIContextBundle,
  type AgentResponse,
} from "@ai-todo/contracts";

export type AgentClient = (bundle: AIContextBundle) => Promise<AgentResponse>;

export const DEFAULT_AGENT_ENDPOINT = "/api";
export const LEGACY_AGENT_ENDPOINT = "http://localhost:8787";

const normalizeEndpoint = (endpoint: string) => endpoint.replace(/\/+$/, "");

export const createRemoteAgentClient = (endpoint: string): AgentClient => {
  return async (bundle) => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(
        `${normalizeEndpoint(endpoint)}/agent/respond`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(bundle),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new Error(`Agent request failed with ${response.status}`);
      }

      const json = await response.json();
      return agentResponseSchema.parse(json);
    } finally {
      window.clearTimeout(timeout);
    }
  };
};
