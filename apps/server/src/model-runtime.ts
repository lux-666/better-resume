import type { StreamFn } from "@earendil-works/pi-agent-core";
import {
  createModels,
  createProvider,
  envApiKeyAuth,
  type Api,
  type Model,
  type MutableModels,
  type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";

export type ModelRuntime = {
  mode: "demo" | "llm";
  provider?: string;
  modelId?: string;
  model?: Model<Api>;
  streamFn?: StreamFn;
};

function value(env: NodeJS.ProcessEnv, name: string): string | undefined {
  return env[name]?.trim() || undefined;
}

function llmValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  return value(env, `LLM_${name}`) ?? value(env, `GENE_AGENT_LLM_${name}`);
}

function numberValue(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number | undefined,
  valid: (number: number) => boolean,
): number | undefined {
  const raw = llmValue(env, name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !valid(parsed)) throw new Error(`${name} is invalid`);
  return parsed;
}

export function createModelRuntime(env: NodeJS.ProcessEnv = process.env): ModelRuntime {
  const provider = llmValue(env, "PROVIDER") ?? value(env, "PI_PROVIDER");
  const modelId = llmValue(env, "MODEL") ?? value(env, "PI_MODEL");
  if (Boolean(provider) !== Boolean(modelId)) throw new Error("LLM provider and model must be set together");
  if (!provider || !modelId) return { mode: "demo" };

  const maxTokens = numberValue(
    env,
    "MAX_TOKENS",
    undefined,
    (number) => Number.isInteger(number) && number > 0,
  );
  const temperature = numberValue(env, "TEMPERATURE", undefined, (number) => number >= 0 && number <= 2);
  const timeoutSeconds = numberValue(env, "TIMEOUT_SECONDS", undefined, (number) => number > 0);
  const streamDefaults: SimpleStreamOptions = {
    ...(maxTokens === undefined ? {} : { maxTokens }),
    ...(temperature === undefined ? {} : { temperature }),
    ...(timeoutSeconds === undefined ? {} : { timeoutMs: timeoutSeconds * 1_000 }),
  };

  let models: MutableModels;
  if (provider === "openai_compatible") {
    const baseUrl = llmValue(env, "BASE_URL");
    const apiKey = llmValue(env, "API_KEY");
    if (!baseUrl || !apiKey) {
      throw new Error("LLM_BASE_URL and LLM_API_KEY are required");
    }
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("LLM_BASE_URL must use http or https");
    }
    const model: Model<"openai-responses"> = {
      id: modelId,
      name: modelId,
      api: "openai-responses",
      provider,
      baseUrl: baseUrl.replace(/\/+$/, ""),
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128_000,
      maxTokens: maxTokens ?? 8_192,
    };
    models = createModels();
    models.setProvider(createProvider({
      id: provider,
      name: "OpenAI-compatible API",
      baseUrl: model.baseUrl,
      auth: { apiKey: envApiKeyAuth("OpenAI-compatible API key", ["LLM_API_KEY", "GENE_AGENT_LLM_API_KEY"]) },
      models: [model],
      api: openAIResponsesApi(),
    }));
  } else {
    models = builtinModels();
  }

  const model = models.getModel(provider, modelId);
  if (!model) throw new Error(`Unknown Pi model: ${provider}/${modelId}`);
  const streamFn: StreamFn = (requestModel, context, options) => models.streamSimple(
    requestModel,
    context,
    { ...streamDefaults, ...options },
  );
  return { mode: "llm", provider, modelId, model, streamFn };
}
