import { createHash, randomUUID } from "node:crypto";
import type { AssistantMessage, Usage } from "@earendil-works/pi-ai";
import type { AgentEvent, StreamFn } from "@earendil-works/pi-agent-core";

export type TelemetryErrorKind = "api_error" | "tool_error" | "state_error" | "runtime_error" | "aborted";

export interface TelemetrySpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  sessionId?: string;
  commandId?: string;
  turnId?: string;
  kind: "agent" | "model" | "tool" | "state";
  operation: string;
  startedAt: string;
  durationMs?: number;
  provider?: string;
  model?: string;
  responseModel?: string;
  responseId?: string;
  stopReason?: string;
  retryCount?: number;
  usage?: Partial<Usage>;
  context?: { chars: number; bytes: number; approximateInputTokens: number; fingerprint: string };
  toolName?: string;
  error?: { kind: TelemetryErrorKind; message: string; retryable?: boolean };
}

export interface TelemetryTrace {
  traceId: string;
  sessionId?: string;
  commandId?: string;
  turnId?: string;
  startedAt: string;
  spans: TelemetrySpan[];
}

export class TelemetryCollector {
  readonly trace: TelemetryTrace;
  private readonly toolSpans = new Map<string, TelemetrySpan>();
  constructor(ids: Pick<TelemetryTrace, "sessionId" | "commandId" | "turnId"> = {}) {
    this.trace = { traceId: randomUUID(), startedAt: new Date().toISOString(), spans: [], ...ids };
  }

  start(operation: string, kind: TelemetrySpan["kind"], parentSpanId?: string): TelemetrySpan {
    const span: TelemetrySpan = {
      traceId: this.trace.traceId, spanId: randomUUID(), parentSpanId,
      sessionId: this.trace.sessionId, commandId: this.trace.commandId, turnId: this.trace.turnId,
      kind, operation, startedAt: new Date().toISOString(),
    };
    this.trace.spans.push(span);
    return span;
  }

  finish(span: TelemetrySpan, details: Partial<TelemetrySpan> = {}): void {
    Object.assign(span, details, { durationMs: Math.max(0, Date.now() - Date.parse(span.startedAt)) });
  }

  error(span: TelemetrySpan, kind: TelemetryErrorKind, error: unknown, retryable?: boolean): void {
    const toolText = typeof error === "object" && error && "content" in error && Array.isArray(error.content)
      ? error.content.find((item: any) => item?.type === "text")?.text : undefined;
    span.error = { kind, message: error instanceof Error ? error.message : toolText ?? String(error), retryable };
  }

  instrumentStreamFn(streamFn: StreamFn, parentSpanId: string): StreamFn {
    return async (requestModel, context, options) => {
      const span = this.start("model_request", "model", parentSpanId);
      const canonical = canonicalJson(context);
      span.provider = requestModel.provider;
      span.model = requestModel.id;
      span.context = {
        chars: canonical.length,
        bytes: Buffer.byteLength(canonical),
        approximateInputTokens: Math.ceil(canonical.length / 4),
        fingerprint: createHash("sha256").update(canonical).digest("hex"),
      };
      try {
        const stream = await streamFn(requestModel, context, { ...options, sessionId: options?.sessionId ?? this.trace.sessionId });
        stream.result().then((message: AssistantMessage) => {
          this.finish(span, {
            responseId: message.responseId,
            responseModel: message.responseModel,
            stopReason: message.stopReason,
            usage: message.usage ? { ...message.usage } : undefined,
          });
          if (message.stopReason === "error") this.error(span, "api_error", message.errorMessage ?? "Provider returned an error", true);
          if (message.stopReason === "aborted") this.error(span, "aborted", message.errorMessage ?? "Model request aborted");
        }).catch((error) => { this.error(span, "api_error", error, true); this.finish(span); });
        return stream;
      } catch (error) {
        this.error(span, "api_error", error, true); this.finish(span); throw error;
      }
    };
  }

  recordAgentEvent(event: AgentEvent, parentSpanId: string): void {
    if (event.type === "tool_execution_start") {
      const span = this.start("tool_call", "tool", parentSpanId);
      span.toolName = event.toolName;
      this.toolSpans.set(`${parentSpanId}:${event.toolCallId}`, span);
    } else if (event.type === "tool_execution_end") {
      const span = this.toolSpans.get(`${parentSpanId}:${event.toolCallId}`);
      if (span) {
        if (event.isError) this.error(span, "tool_error", event.result);
        this.finish(span);
        this.toolSpans.delete(`${parentSpanId}:${event.toolCallId}`);
      }
    }
  }
}

const nonModelKeys = new Set(["timestamp", "usage", "responseId", "diagnostics", "rawStopReason", "errorMessage"]);

function canonicalJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (!item || typeof item !== "object") return item;
    return Object.fromEntries(Object.entries(item as Record<string, unknown>)
      .filter(([key, child]) => !nonModelKeys.has(key) && typeof child !== "function" && child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, normalize(child)]));
  };
  return JSON.stringify(normalize(value));
}
