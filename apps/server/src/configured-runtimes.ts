import type { RuntimeInfo } from "../../../packages/api-contract/src/index.ts";
import { createModelRuntime, resolveAgentModelIds, type ModelRuntime } from "./model-runtime.ts";
export type RuntimeSet = { fallback?: ModelRuntime; report: ModelRuntime; interview: ModelRuntime; info: RuntimeInfo };
export function configuredRuntimes(env: NodeJS.ProcessEnv = process.env): RuntimeSet {
  const base = createModelRuntime(env);
  if (base.mode === "demo") return { report: base, interview: base, info: { mode: "demo" } };
  const ids = resolveAgentModelIds(env);
  const report = createModelRuntime(env, ids.reportModelId);
  const interview = createModelRuntime(env, ids.interviewModelId);
  if (report.provider !== interview.provider) throw new Error("Agent models must use one provider");
  const fallback = env.LLM_FALLBACK_MODEL?.trim() ? createModelRuntime(env, env.LLM_FALLBACK_MODEL.trim()) : undefined;
  return { report, interview, fallback, info: { mode: "llm", provider: base.provider,
    ...(ids.reportModelId === ids.interviewModelId ? { modelId: ids.reportModelId } : {}), ...ids } };
}
