export interface EmbeddingClient {
  fingerprint: string;
  model: string;
  embed(inputs: string[], signal?: AbortSignal): Promise<number[][]>;
}

export function configuredEmbedding(env: NodeJS.ProcessEnv = process.env): EmbeddingClient | undefined {
  const model = env.LLM_EMBEDDING_MODEL?.trim();
  const baseUrl = (env.LLM_EMBEDDING_BASE_URL?.trim() || env.LLM_BASE_URL?.trim())?.replace(/\/+$/, "");
  const apiKey = (env.LLM_EMBEDDING_API_KEY?.trim() || env.LLM_API_KEY?.trim());
  if (!model || !baseUrl || !apiKey) return undefined;
  const timeoutMs = Number(env.LLM_EMBEDDING_TIMEOUT_SECONDS ?? 30) * 1000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("LLM_EMBEDDING_TIMEOUT_SECONDS must be positive");
  return {
    fingerprint: JSON.stringify([baseUrl, model]), model,
    async embed(inputs, signal) {
      const requestSignal = AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]);
      const response = await fetch(`${baseUrl}/embeddings`, { method: "POST", signal: requestSignal,
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, input: inputs, encoding_format: "float" }) });
      if (!response.ok) throw new Error(`Embedding provider returned HTTP ${response.status}`);
      const body = await response.json() as { data?: Array<{ index: number; embedding: number[] }> };
      const data = body.data;
      if (!Array.isArray(data) || data.length !== inputs.length) throw new Error("Embedding response count mismatch");
      const sorted = data.toSorted((a, b) => a.index - b.index);
      for (const [index, item] of sorted.entries()) {
        if (item.index !== index || !Array.isArray(item.embedding) || !item.embedding.length ||
          !item.embedding.every((n) => typeof n === "number" && Number.isFinite(n)) ||
          !item.embedding.some((n) => n !== 0) || item.embedding.length !== sorted[0].embedding.length) {
          throw new Error("Embedding response contains an invalid vector");
        }
      }
      return sorted.map((item) => item.embedding);
    },
  };
}
