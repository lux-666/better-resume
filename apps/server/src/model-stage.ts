import { EvidenceValidationError, ModelProviderError, withOneProviderRetry } from "../../../packages/pi-runtime/src/index.ts";
import type { TelemetryCollector } from "../../../packages/pi-runtime/src/telemetry.ts";
import type { ModelRuntime } from "./model-runtime.ts";
export async function runModelStage<T>(options: { primary: ModelRuntime; fallback?: ModelRuntime; telemetry: TelemetryCollector; signal: AbortSignal; primaryTimeoutMs?: number;
  invoke: (runtime: ModelRuntime, attempt: number, signal: AbortSignal) => Promise<T> }): Promise<{ value: T; modelId?: string; fallbackUsed: boolean; attempts: number }> {
  let attempt = 0; let failure: unknown;
  const timeout = options.fallback ? AbortSignal.timeout(Math.max(1, Math.floor(options.primaryTimeoutMs ?? 30_000))) : undefined;
  const primarySignal = timeout ? AbortSignal.any([options.signal, timeout]) : options.signal;
  try {
    const value = await withOneProviderRetry(() => options.invoke(options.primary, ++attempt, primarySignal), undefined, primarySignal);
    return { value, modelId: options.primary.modelId, fallbackUsed: false, attempts: attempt };
  } catch (error) {
    options.signal.throwIfAborted(); failure = error;
    if (!primarySignal.aborted && !(error instanceof EvidenceValidationError) && !(error instanceof ModelProviderError)) throw error;
  }
  if (!options.fallback) throw failure;
  const span = options.telemetry.start("fallback_model", "state", undefined, { fallback: { fromModel: options.primary.modelId ?? "unknown", toModel: options.fallback.modelId ?? "unknown", reason: timeout?.aborted ? "timeout" : failure instanceof EvidenceValidationError ? "validation" : "provider", adopted: false } });
  try {
    const value = await options.invoke(options.fallback, ++attempt, options.signal); options.signal.throwIfAborted();
    options.telemetry.finish(span, { fallback: { ...span.fallback!, adopted: true } });
    return { value, modelId: options.fallback.modelId, fallbackUsed: true, attempts: attempt };
  } catch (error) { options.telemetry.error(span, "runtime_error", error, true); options.telemetry.finish(span); throw error; }
}
