import type { AIContextBundle, AgentResponse } from "@ai-todo/contracts";

export interface ProviderAdapter {
  id: string;
  respond: (bundle: AIContextBundle) => Promise<AgentResponse>;
}
