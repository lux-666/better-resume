import type { RunProgress, RunStatus, Stage, TelemetrySpan, TelemetryTrace } from "./telemetry.ts";
import { projectAgentSteps } from "./trajectory.ts";

export type Measurement = { value: number | null; availability: "complete" | "partial" | "unavailable"; known: number; total: number };
function sum(values: Array<number | undefined>): Measurement {
  const known = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return { value: known.length ? known.reduce((a, b) => a + b, 0) : null,
    availability: !known.length ? "unavailable" : known.length === values.length ? "complete" : "partial", known: known.length, total: values.length };
}
function percentile(values: number[], quantile: number): number | null {
  if (!values.length) return null;
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)];
}
export function summarizeTelemetry(traces: readonly TelemetryTrace[]) {
  const spans = traces.flatMap((trace) => trace.spans);
  const models = spans.filter((span) => span.kind === "model");
  const successful = traces.filter((trace) => trace.status === "succeeded" && typeof trace.durationMs === "number");
  const durations = successful.map((trace) => trace.durationMs!);
  const usage = (key: "input" | "output" | "cacheRead" | "cacheWrite" | "reasoning") => sum(models.map((span) => span.usage?.[key]));
  return {
    traceCount: traces.length,
    completedTurns: new Set(traces.filter((t) => t.operation === "answer" && t.status === "succeeded" && t.turnId).map((t) => t.turnId)).size,
    activeCount: traces.filter((trace) => trace.status === "running").length,
    failedCount: traces.filter((trace) => ["failed", "timed_out", "interrupted"].includes(trace.status ?? "")).length,
    spanCount: spans.length,
    spansByKind: Object.fromEntries(["agent", "model", "tool", "state", "retrieval", "embedding", "recall"].map((kind) => [kind, spans.filter((span) => span.kind === kind).length])),
    modelRequestCount: models.length,
    providerErrors: { count: models.filter((s) => s.error?.kind === "api_error").length, sampleCount: models.length, rate: models.length ? models.filter((s) => s.error?.kind === "api_error").length / models.length : null },
    timeoutCount: traces.filter((t) => t.status === "timed_out").length,
    fallback: { attempted: spans.filter((s) => s.fallback).length, adopted: spans.filter((s) => s.fallback?.adopted).length,
      adoptionRate: spans.some((s) => s.fallback) ? spans.filter((s) => s.fallback?.adopted).length / spans.filter((s) => s.fallback).length : null },
    answerLatency: (() => { const samples = successful.filter((t) => t.operation === "answer").map((t) => t.durationMs!); return { sampleCount: samples.length, p50Ms: percentile(samples, .5), p95Ms: percentile(samples, .95) }; })(),
    providerRetryCount: spans.filter((span) => span.kind === "agent" && (span.attempt ?? 1) > 1).length,
    toolRejectionCount: spans.filter((span) => span.kind === "tool" && (span.status === "failed" || span.outcome === "rejected")).length,
    errorSpanCount: spans.filter((span) => span.error).length,
    modelDurationSumMs: sum(models.map((span) => span.durationMs)),
    latency: { sampleCount: durations.length, p50Ms: percentile(durations, .5), p95Ms: percentile(durations, .95) },
    inputTokens: usage("input"), outputTokens: usage("output"), cacheReadTokens: usage("cacheRead"), cacheWriteTokens: usage("cacheWrite"), reasoningTokens: usage("reasoning"),
    totalInputTokens: sum(models.map((span) => {
      const u = span.usage;
      return u?.input === undefined || u.cacheRead === undefined || u.cacheWrite === undefined ? undefined : u.input + u.cacheRead + u.cacheWrite;
    })),
  };
}
function stageForSpan(span: TelemetrySpan): Stage | undefined {
  if (span.operation === "report_agent") return "report";
  if (span.operation === "interview_agent") return "interview";
  if (span.operation === "narrative_agent") return "narrative";
  if (span.operation.startsWith("persist")) return "saving";
}
export function projectRunProgress(trace: TelemetryTrace, now = Date.now()): RunProgress {
  const stages = trace.spans.filter((span) => stageForSpan(span));
  const latest = stages.at(-1);
  const completedStages = [...new Set(stages.filter((span) => span.status === "succeeded").map((span) => stageForSpan(span)!))];
  return {
    traceId: trace.traceId, commandId: trace.commandId, operation: trace.operation ?? "unknown",
    revision: trace.revision ?? 0, stateVersion: trace.stateVersion,
    status: (trace.status ?? "interrupted") as RunStatus, stage: latest ? stageForSpan(latest)! : "received", completedStages,
    startedAt: trace.startedAt, elapsedMs: trace.durationMs ?? Math.max(0, now - Date.parse(trace.startedAt)),
    retryCount: summarizeTelemetry([trace]).providerRetryCount,
    steps: projectAgentSteps(trace, now),
  };
}
