import { buildFallbackVector } from "../agent/embedding";

type WorkerResponse = {
  id: string;
  vector: number[];
  provider: "transformers" | "fallback";
  error?: string;
};

let extractorPromise: Promise<
  ((text: string) => Promise<number[]>) | undefined
> | null = null;

const loadExtractor = async () => {
  const transformers = await import("@xenova/transformers");
  const extractor = await transformers.pipeline(
    "feature-extraction",
    "Xenova/all-MiniLM-L6-v2",
  );
  return async (text: string) => {
    const output = await extractor(text, {
      pooling: "mean",
      normalize: true,
    });
    const data = output.data as Float32Array;
    return Array.from(data);
  };
};

const getExtractor = async () => {
  if (!extractorPromise) {
    extractorPromise = loadExtractor().catch(() => undefined);
  }
  return extractorPromise;
};

self.onmessage = async (event: MessageEvent<{ id: string; text: string }>) => {
  const extractor = await getExtractor();
  const response: WorkerResponse = {
    id: event.data.id,
    vector: [],
    provider: "fallback",
  };

  try {
    if (extractor) {
      response.vector = await extractor(event.data.text);
      response.provider = "transformers";
    } else {
      response.vector = buildFallbackVector(event.data.text);
    }
  } catch {
    response.vector = buildFallbackVector(event.data.text);
  }

  self.postMessage(response);
};
