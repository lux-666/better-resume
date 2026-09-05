import { Type, type Static } from "typebox";
import type { TelemetryCollector } from "./telemetry.ts";
import type { KnowledgeStatus } from "../../api-contract/src/telemetry.ts";
export type { KnowledgeStatus } from "../../api-contract/src/telemetry.ts";
export const KnowledgeQuerySchema = Type.Object({
  query: Type.String({ minLength: 1, maxLength: 1000 }),
  fieldKind: Type.Optional(Type.Union([Type.Literal("ownership"), Type.Literal("mechanism"), Type.Literal("measurement"), Type.Literal("failure")])),
  targetDepth: Type.Optional(Type.Integer({ minimum: 1, maximum: 5 })),
}, { additionalProperties: false });
export type KnowledgeQuery = Static<typeof KnowledgeQuerySchema>;
export type KnowledgeHit = { id: string; kind: string; text: string; score: number; sourcePath: string };
export interface ProbeKnowledge {
  health(): KnowledgeStatus;
  retrieve(query: KnowledgeQuery, context?: { telemetry?: TelemetryCollector; signal?: AbortSignal }): Promise<KnowledgeHit[]>;
}
