import { RequirementStatusSchema } from "./phase4-schema.ts";
import { Type, type Static } from "typebox";
export const NarrativeSentenceSchema = Type.Object({ text: Type.String({ minLength: 1, maxLength: 800 }), evidenceIds: Type.Array(Type.String(), { maxItems: 20, uniqueItems: true }) }, { additionalProperties: false });
const paragraph = () => Type.Array(NarrativeSentenceSchema, { minItems: 1, maxItems: 4 });
export const ReportNarrativeSchema = Type.Object({
  schemaVersion: Type.Literal("report-narrative-v0.1"), overall: paragraph(),
  sections: Type.Optional(Type.Array(Type.Object({
    title: Type.String({ minLength: 1, maxLength: 100 }), paragraphs: paragraph(),
  }, { additionalProperties: false }), { maxItems: 10 })),
  insights: Type.Optional(Type.Array(Type.Object({
    kind: Type.Union([Type.Literal("strength"), Type.Literal("development"), Type.Literal("risk")]),
    title: Type.String({ minLength: 1, maxLength: 80 }), explanation: NarrativeSentenceSchema,
  }, { additionalProperties: false }), { maxItems: 8 })),
  improvementPlan: Type.Optional(Type.Array(Type.Object({
    title: Type.String({ minLength: 1, maxLength: 80 }),
    priority: Type.Union([Type.Literal("first"), Type.Literal("next"), Type.Literal("stretch")]),
    rationale: NarrativeSentenceSchema,
    action: Type.String({ minLength: 1, maxLength: 500 }), acceptance: Type.String({ minLength: 1, maxLength: 400 }),
  }, { additionalProperties: false }), { maxItems: 5 })),
  requirements: Type.Optional(Type.Array(Type.Object({ requirementId: Type.String(), status: RequirementStatusSchema, conclusion: NarrativeSentenceSchema }, { additionalProperties: false }), { maxItems: 30 })),
  competencies: Type.Array(Type.Object({ competencyId: Type.String(),
    verdict: Type.Union([Type.Literal("demonstrated"), Type.Literal("partially_demonstrated"), Type.Literal("not_demonstrated"), Type.Literal("conflicting")]),
    boundary: paragraph(), highlights: Type.Array(NarrativeSentenceSchema, { maxItems: 4 }),
  }, { additionalProperties: false }), { maxItems: 20 }),
  projects: Type.Array(Type.Object({ projectId: Type.String(), summary: paragraph() }, { additionalProperties: false }), { maxItems: 12 }),
  recruiterNextSteps: Type.Array(NarrativeSentenceSchema, { maxItems: 8 }), candidateFeedback: Type.Array(NarrativeSentenceSchema, { maxItems: 8 }),
  unexploredLeads: Type.Array(Type.String(), { maxItems: 80 }),
}, { additionalProperties: false });
export type ReportNarrative = Static<typeof ReportNarrativeSchema>;
export type NarrativeSentence = Static<typeof NarrativeSentenceSchema>;
export type NarrativeStatus = "not_requested" | "pending" | "ready" | "failed";
