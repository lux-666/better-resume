import { Type, type Static } from "typebox";
import { Check } from "typebox/value";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { InterviewState } from "../../interview-core/src/types.ts";
import type { TelemetryCollector } from "./telemetry.ts";
const RecallQuerySchema = Type.Object({ query: Type.String({ minLength: 1, maxLength: 500 }),
  scope: Type.Union([Type.Literal("turns"), Type.Literal("evidence"), Type.Literal("both"), Type.Literal("resume")]),
  projectId: Type.Optional(Type.String()), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 5 })),
}, { additionalProperties: false });
export type RecallQuery = Static<typeof RecallQuerySchema>;
export type RecallHit = { kind: "turn" | "evidence" | "resume"; id: string; text: string; projectId?: string; turnIndex?: number; score: number; truncated?: boolean };
export interface SessionRecall {
  recall(state: InterviewState, query: RecallQuery, context: { telemetry?: TelemetryCollector; signal?: AbortSignal; excludedTurnIds?: string[] }): Promise<RecallHit[]>;
}
export function recallTool(options: { memory: SessionRecall; state: InterviewState; telemetry?: TelemetryCollector; signal?: AbortSignal; budget: { remaining: number }; excludedTurnIds?: string[]; canRead?: () => boolean; onHits?: (hits: RecallHit[]) => unknown }): AgentTool {
  return { name: "recall", label: "Recall session sources", description: "Retrieve earlier turns or accepted evidence within this session, including other projects. OMIT projectId for cross-project corrections; projectId is a strict filter, not the active project context. Resume scope returns unverified source material, never evidence. At most twice per agent per turn.", parameters: RecallQuerySchema,
    execute: async (_, value) => {
      if (options.canRead && !options.canRead()) throw new Error("Read the report before recall");
      if (!Check(RecallQuerySchema, value) || !value.query.trim()) throw new Error("Invalid recall query");
      if (options.budget.remaining <= 0) return { content: [{ type: "text", text: '{"status":"limit_reached","hits":[]}' }], details: {} };
      options.budget.remaining--;
      try {
        const hits = await options.memory.recall(options.state, value, { telemetry: options.telemetry, signal: options.signal, excludedTurnIds: options.excludedTurnIds });
        const references = options.onHits?.(hits);
        return { content: [{ type: "text", text: JSON.stringify({ status: "ready", hits, references, warning: "Historical and resume material is context only. Evidence must quote the current answer." }) }], details: {} };
      } catch { options.signal?.throwIfAborted(); return { content: [{ type: "text", text: '{"status":"unavailable","hits":[],"fallback":"Use the source-linked summary and current answer; do not invent historical facts."}' }], details: {} }; }
    },
  };
}
