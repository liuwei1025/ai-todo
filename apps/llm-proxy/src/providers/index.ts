import type { ProviderAdapter } from "./types";
import { createMockAdapter } from "./mock";
import { createOpenAIAdapter } from "./openai";
import { createVolcengineAdapter } from "./volcengine";

const adapters: Record<string, () => ProviderAdapter> = {
  openai: createOpenAIAdapter,
  volcengine: createVolcengineAdapter,
};

export const createProviderAdapter = (providerId: string): ProviderAdapter => {
  const factory = adapters[providerId];
  return factory ? factory() : createMockAdapter();
};
