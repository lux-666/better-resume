import { Type, type Static } from "typebox";
export const NarrativeSentenceSchema = Type.Object({ text: Type.String({ minLength: 1, maxLength: 800 }), evidenceIds: Type.Array(Type.String(), { maxItems: 20, uniqueItems: true }) }, { additionalProperties: false });
const paragraph = () => Type.Array(NarrativeSentenceSchema, { minItems: 1, maxItems: 4 });
export const ReportNarrativeSchema = Type.Object({
  schemaVersion: Type.Literal("report-narrative-v0.1"), overall: paragraph(),
  requirements: Type.Optional(Type.Array(Type.Object({ requirementId: Type.String(), status: Type.Union([Type.Literal("supported"), Type.Literal("partial"), Type.Literal("weak"), Type.Literal("contradicted"), Type.Literal("not_investigated")]), conclusion: NarrativeSentenceSchema }, { additionalProperties: false }), { maxItems: 30 })),
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
