import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import {
  agentResponseSchema,
  aiContextBundleSchema,
  type AIContextBundle,
} from "@ai-todo/contracts";
import { createProviderAdapter } from "./providers";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const providerId = process.env.LLM_PROVIDER ?? "mock";
const provider = createProviderAdapter(providerId);
const port = Number(process.env.PORT ?? 8787);

const summarizeContext = (bundle: AIContextBundle) => ({
  strategyId: bundle.activeStrategy.id,
  privacyPolicyVersion: bundle.privacyPolicy.version,
  recentTurnCount: bundle.recentTurns.length,
  retrievedTaskCount: bundle.retrievedTasks.length,
  retrievedMemoryCount: bundle.retrievedMemories.length,
});

app.get("/health", (_request, response) => {
  const isFallback = provider.isMockFallback?.() ?? false;
  response.json({
    ok: true,
    provider: provider.id,
    ...(isFallback && { providerActual: "mock (fallback — API key missing)" }),
  });
});

app.post("/agent/respond", async (request, response) => {
  try {
    const bundle = aiContextBundleSchema.parse(request.body);
    console.info("agent.respond", summarizeContext(bundle));
    const result = await provider.respond(bundle);
    response.json(agentResponseSchema.parse(result));
  } catch (reason) {
    const message =
      reason instanceof Error ? reason.message : "Unknown proxy failure";
    response.status(500).json({
      message,
      toolCalls: [],
    });
  }
});

app.listen(port, () => {
  console.info(
    `AI TODO proxy listening on http://localhost:${port} using ${provider.id}`,
  );
});
