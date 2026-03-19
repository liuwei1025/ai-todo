import type { ProviderAdapter } from "./types";
import { createMockAdapter } from "./mock";
import { createOpenAIAdapter } from "./openai";

export const createProviderAdapter = (providerId: string): ProviderAdapter => {
  if (providerId === "openai") {
    return createOpenAIAdapter();
  }

  return createMockAdapter();
};
