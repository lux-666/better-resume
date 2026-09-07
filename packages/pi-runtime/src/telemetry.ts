import { createHash, randomUUID } from "node:crypto";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { AgentEvent, StreamFn } from "@earendil-works/pi-agent-core";
import type { RunStatus, TelemetrySpan, TelemetryTrace } from "../../api-contract/src/telemetry.ts";
export type { TelemetrySpan, TelemetryTrace } from "../../api-contract/src/telemetry.ts";
type TelemetryErrorKind = "api_error" | "tool_error" | "state_error" | "runtime_error" | "aborted";
type TraceIds = Pick<TelemetryTrace, "sessionId" | "commandId" | "turnId" | "operation" | "stateVersion">;

export class TelemetryCollector {
  readonly trace: TelemetryTrace;
  private readonly toolSpans = new Map<string, TelemetrySpan>();
  private readonly clocks = new Map<string, number>();
  private readonly started = performance.now();
  private readonly listeners = new Set<(trace: TelemetryTrace) => void>();
  constructor(ids: TraceIds = {}) {
    this.trace = { traceId: randomUUID(), startedAt: new Date().toISOString(), spans: [], status: "running", revision: 0, ...ids };
  }
  subscribe(listener: (trace: TelemetryTrace) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private publish(): void {
    this.trace.revision = (this.trace.revision ?? 0) + 1;
    for (const listener of this.listeners) {
      try { listener(this.trace); } catch { /* Observers cannot change command settlement. */ }
    }
  }
  linkTurn(turnId: string): void {
    this.trace.turnId = turnId;
    for (const span of this.trace.spans) span.turnId = turnId;
    this.publish();
  }
  referenceKnowledge(ids: string[], spanIds: ReadonlySet<string>): void {
    for (const span of this.trace.spans) if (span.retrieval && spanIds.has(span.spanId)) {
      span.retrieval.referencedIds = ids.filter((id) => span.retrieval!.hits.some((hit) => hit.id === id));
    }
    this.publish();
  }
  start(operation: string, kind: TelemetrySpan["kind"], parentSpanId?: string, details: Partial<TelemetrySpan> = {}): TelemetrySpan {
    if (this.trace.status !== "running") throw new Error("Cannot start a span on a settled trace");
    const span: TelemetrySpan = { ...details,
      traceId: this.trace.traceId, spanId: randomUUID(), parentSpanId,
      sessionId: this.trace.sessionId, commandId: this.trace.commandId, turnId: this.trace.turnId,
      kind, operation, startedAt: new Date().toISOString(), status: "running",
    };
    this.clocks.set(span.spanId, performance.now());
    this.trace.spans.push(span);
    this.publish();
    return span;
  }
  finish(span: TelemetrySpan, details: Partial<TelemetrySpan> = {}): void {
    if (span.status !== "running") return;
    Object.assign(span, details, { endedAt: new Date().toISOString(),
      durationMs: Math.max(0, Math.round(performance.now() - (this.clocks.get(span.spanId) ?? performance.now()))),
      status: details.status ?? (span.error ? "failed" : "succeeded") });
    this.publish();
  }
  end(status: Exclude<RunStatus, "running">): void {
    if (this.trace.status !== "running") return;
    for (const span of this.trace.spans) if (span.status === "running") this.finish(span, { status: status === "succeeded" ? "interrupted" : status });
    this.trace.status = status;
    this.trace.endedAt = new Date().toISOString();
    this.trace.durationMs = Math.max(0, Math.round(performance.now() - this.started));
    this.publish();
  }
  error(span: TelemetrySpan, kind: TelemetryErrorKind, _error: unknown, retryable?: boolean): void {
    if (span.status !== "running") return;
    // Provider/tool exceptions may contain prompts or credentials; only stable categories leave the runtime.
    span.error = { kind, code: kind.toUpperCase(), message: errorMessages[kind], retryable };
  }
  instrumentStreamFn(streamFn: StreamFn, parentSpanId: string): StreamFn {
    return async (requestModel, context, options) => {
      const canonical = canonicalJson(context);
      const span = this.start("model_request", "model", parentSpanId, {
        provider: requestModel.provider, model: requestModel.id,
        context: { chars: canonical.length, bytes: Buffer.byteLength(canonical), approximateInputTokens: Math.ceil(canonical.length / 4),
          fingerprint: createHash("sha256").update(canonical).digest("hex") },
      });
      try {
        const stream = await streamFn(requestModel, context, { ...options, sessionId: options?.sessionId ?? this.trace.sessionId });
        stream.result().then((message: AssistantMessage) => {
          if (message.stopReason === "error") this.error(span, "api_error", undefined, true);
          if (message.stopReason === "aborted") this.error(span, "aborted", undefined);
          const usage = message.usage && Object.fromEntries(["input", "output", "reasoning", "cacheRead", "cacheWrite", "totalTokens"]
            .filter((key) => typeof message.usage[key as keyof typeof message.usage] === "number")
            .map((key) => [key, message.usage[key as keyof typeof message.usage]]));
          this.finish(span, { responseId: message.responseId, responseModel: message.responseModel, stopReason: message.stopReason, usage });
        }).catch((error) => { this.error(span, "api_error", error, true); this.finish(span); });
        return stream;
      } catch (error) {
        this.error(span, "api_error", error, true); this.finish(span); throw error;
      }
    };
  }
  recordAgentEvent(event: AgentEvent, parentSpanId: string): void {
    if (event.type === "message_update") {
      const model = this.trace.spans.findLast((span) => span.parentSpanId === parentSpanId && span.kind === "model" && span.status === "running");
      const type = event.assistantMessageEvent.type;
      if (model && model.firstResponseMs === undefined && (type === "text_delta" || type === "toolcall_delta")) {
        model.firstResponseMs = Math.max(0, Math.round(performance.now() - this.clocks.get(model.spanId)!));
        this.publish();
      }
    } else if (event.type === "tool_execution_start") {
      const span = this.start("tool_call", "tool", parentSpanId, { toolName: event.toolName });
      this.toolSpans.set(`${parentSpanId}:${event.toolCallId}`, span);
    } else if (event.type === "tool_execution_end") {
      const key = `${parentSpanId}:${event.toolCallId}`;
      const span = this.toolSpans.get(key);
      if (span) {
        if (event.isError) this.error(span, "tool_error", undefined);
        const details = event.result?.details as { accepted?: boolean; blockerCodes?: string[] } | undefined;
        const content = event.result?.content as Array<{ type: string; text?: string }> | undefined;
        const text = (content ?? []).filter((item) => item.type === "text").map((item) => item.text ?? "").join("\n");
        this.finish(span, { outcome: event.isError || details?.accepted === false ? "rejected" : "accepted",
          resultBytes: Buffer.byteLength(text),
          ...(details?.accepted === false ? { blockerCodes: details.blockerCodes ?? ["completion_rejected"] }
            : event.isError ? { blockerCodes: [validationCode(text)] } : {}) });
        this.toolSpans.delete(key);
      }
    }
  }
}
function validationCode(message: string): string {
  const categories: Array<[RegExp, string]> = [
    [/sourceQuote|verbatim|Lead text must quote/i, "quote_not_verbatim"],
    [/schema|input is invalid|structure/i, "invalid_schema"],
    [/unknown claim/i, "unknown_claim"], [/unknown.*field|incompatible report field/i, "invalid_field"],
    [/depthLevel|targetDepth/i, "invalid_depth"], [/read.*report.*before|read the report first/i, "report_not_read"],
    [/internal evaluation/i, "internal_wording"], [/exactly one fact|question mark/i, "question_shape"],
    [/repeats|repeated|skipped|open lead/i, "topic_already_handled"],
    [/citation|scope/i, "invalid_citation"], [/number/i, "unsupported_number"], [/verdict/i, "verdict_conflict"],
  ];
  return categories.find(([pattern]) => pattern.test(message))?.[1] ?? "validation_rejected";
}
const errorMessages: Record<TelemetryErrorKind, string> = {
  api_error: "Model provider request failed", tool_error: "Tool validation failed", state_error: "State operation failed",
  runtime_error: "Agent did not produce an accepted result", aborted: "Execution interrupted",
};
const nonModelKeys = new Set(["timestamp", "usage", "responseId", "diagnostics", "rawStopReason", "errorMessage"]);
function canonicalJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (!item || typeof item !== "object") return item;
    return Object.fromEntries(Object.entries(item as Record<string, unknown>)
      .filter(([key, child]) => !nonModelKeys.has(key) && typeof child !== "function" && child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, normalize(child)]));
  };
  return JSON.stringify(normalize(value));
}
