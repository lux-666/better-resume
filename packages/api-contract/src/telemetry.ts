import { Type, type Static } from "typebox";

const optionalNumber = () => Type.Optional(Type.Number({ minimum: 0 }));
const statuses = Type.Union([Type.Literal("running"), Type.Literal("succeeded"), Type.Literal("failed"), Type.Literal("timed_out"), Type.Literal("interrupted")]);
export const TelemetrySpanSchema = Type.Object({
  traceId: Type.String(), spanId: Type.String(), parentSpanId: Type.Optional(Type.String()),
  sessionId: Type.Optional(Type.String()), commandId: Type.Optional(Type.String()), turnId: Type.Optional(Type.String()),
  kind: Type.Union([Type.Literal("agent"), Type.Literal("model"), Type.Literal("tool"), Type.Literal("state")]),
  operation: Type.String(), startedAt: Type.String(), endedAt: Type.Optional(Type.String()),
  status: Type.Optional(statuses), durationMs: optionalNumber(), firstResponseMs: optionalNumber(),
  attempt: optionalNumber(), retryCount: optionalNumber(),
  provider: Type.Optional(Type.String()), model: Type.Optional(Type.String()), responseModel: Type.Optional(Type.String()),
  responseId: Type.Optional(Type.String()), stopReason: Type.Optional(Type.String()), toolName: Type.Optional(Type.String()),
  outcome: Type.Optional(Type.Union([Type.Literal("accepted"), Type.Literal("rejected")])),
  blockerCodes: Type.Optional(Type.Array(Type.String())),
  resultBytes: optionalNumber(),
  usage: Type.Optional(Type.Object({ input: optionalNumber(), output: optionalNumber(), reasoning: optionalNumber(),
    cacheRead: optionalNumber(), cacheWrite: optionalNumber(), totalTokens: optionalNumber() }, { additionalProperties: false })),
  context: Type.Optional(Type.Object({ chars: Type.Number(), bytes: Type.Number(), approximateInputTokens: Type.Number(), fingerprint: Type.String() })),
  error: Type.Optional(Type.Object({ kind: Type.String(), code: Type.String(), message: Type.String(), retryable: Type.Optional(Type.Boolean()) })),
}, { additionalProperties: false });
export const TelemetryTraceSchema = Type.Object({
  traceId: Type.String(), sessionId: Type.Optional(Type.String()), commandId: Type.Optional(Type.String()), turnId: Type.Optional(Type.String()),
  startedAt: Type.String(), endedAt: Type.Optional(Type.String()), durationMs: optionalNumber(),
  operation: Type.Optional(Type.String()), status: Type.Optional(statuses), revision: optionalNumber(),
  stateVersion: optionalNumber(), spans: Type.Array(TelemetrySpanSchema),
}, { additionalProperties: false });
export type TelemetrySpan = Static<typeof TelemetrySpanSchema>;
export type TelemetryTrace = Static<typeof TelemetryTraceSchema>;
export type RunStatus = "running" | "succeeded" | "failed" | "timed_out" | "interrupted";
export type Stage = "received" | "report" | "interview" | "saving" | "narrative";
export const RunProgressSchema = Type.Object({
  traceId: Type.String(), commandId: Type.Optional(Type.String()), operation: Type.String(),
  revision: Type.Integer({ minimum: 0 }), stateVersion: optionalNumber(),
  status: statuses, stage: Type.Union([Type.Literal("received"), Type.Literal("report"), Type.Literal("interview"), Type.Literal("saving"), Type.Literal("narrative")]),
  completedStages: Type.Array(Type.String()), startedAt: Type.String(), elapsedMs: Type.Number({ minimum: 0 }),
  retryCount: Type.Integer({ minimum: 0 }),
}, { additionalProperties: false });
export type RunProgress = Static<typeof RunProgressSchema>;
export const stageLabels: Record<Stage, string> = {
  received: "回答已接收", report: "正在整理回答", interview: "正在准备下一问", saving: "正在保存结果", narrative: "正在生成报告叙述",
};
