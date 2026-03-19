export type EmbeddingProvider = "transformers" | "fallback";

export interface EmbeddingResult {
  vector: number[];
  provider: EmbeddingProvider;
}

export interface EmbeddingClientLike {
  embedText(text: string): Promise<EmbeddingResult>;
}

interface WorkerRequest {
  id: string;
  text: string;
}

interface WorkerResponse {
  id: string;
  vector: number[];
  provider: EmbeddingProvider;
  error?: string;
}

export const buildFallbackVector = (text: string, dimensions = 48) => {
  const vector = new Array<number>(dimensions).fill(0);
  const normalized = text.trim().toLowerCase();

  if (!normalized) {
    return vector;
  }

  for (let index = 0; index < normalized.length; index += 1) {
    const code = normalized.charCodeAt(index);
    vector[index % dimensions] += ((code % 31) + 1) / 32;
  }

  const magnitude = Math.sqrt(
    vector.reduce((sum, value) => sum + value * value, 0),
  );
  return magnitude === 0
    ? vector
    : vector.map((value) => Number((value / magnitude).toFixed(6)));
};

export class BrowserEmbeddingClient implements EmbeddingClientLike {
  private worker?: Worker;
  private readonly timeoutMs = 1200;
  private readonly pending = new Map<
    string,
    {
      resolve: (value: EmbeddingResult) => void;
      reject: (error: Error) => void;
    }
  >();

  private ensureWorker() {
    if (typeof Worker === "undefined") {
      return undefined;
    }
    if (this.worker) {
      return this.worker;
    }

    this.worker = new Worker(new URL("../workers/embedding.worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      const pending = this.pending.get(event.data.id);
      if (!pending) {
        return;
      }
      this.pending.delete(event.data.id);
      if (event.data.error) {
        pending.reject(new Error(event.data.error));
        return;
      }
      pending.resolve({
        vector: event.data.vector,
        provider: event.data.provider,
      });
    });
    return this.worker;
  }

  async embedText(text: string) {
    const worker = this.ensureWorker();
    if (!worker) {
      return { vector: buildFallbackVector(text), provider: "fallback" as const };
    }

    return new Promise<EmbeddingResult>((resolve) => {
      const id = crypto.randomUUID();
      const timeout = window.setTimeout(() => {
        this.pending.delete(id);
        resolve({
          vector: buildFallbackVector(text),
          provider: "fallback",
        });
      }, this.timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          window.clearTimeout(timeout);
          resolve(value);
        },
        reject: () => {
          window.clearTimeout(timeout);
          resolve({
            vector: buildFallbackVector(text),
            provider: "fallback",
          });
        },
      });
      const payload: WorkerRequest = { id, text };
      worker.postMessage(payload);
    });
  }
}
