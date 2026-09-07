import { Type, type Static } from "typebox";
const id = () => Type.String({ minLength: 1, maxLength: 100 });
export const SummarySchema = Type.Object({
  version: Type.Integer({ minimum: 0 }), sourceStateVersion: Type.Integer({ minimum: 0 }), charBudget: Type.Literal(1500), truncated: Type.Boolean(),
  candidateStyle: Type.String(), perProject: Type.Array(Type.Object({ projectId: id(), coveredDepth: Type.Record(Type.String(), Type.Number()),
    keyStatements: Type.Array(Type.Object({ text: Type.String(), evidenceId: id() })), openLeads: Type.Array(id()), contradictions: Type.Array(id()),
  })),
});
export type InterviewSummary = Static<typeof SummarySchema>;
export const RolePackSchema = Type.Object({
  version: Type.Literal("role-pack-v0.1"), requirements: Type.Array(Type.Object({ id: id(), text: Type.String({ minLength: 1, maxLength: 2000 }),
    competencyId: id(), priority: Type.Union([Type.Literal("must"), Type.Literal("should"), Type.Literal("nice")]),
    verifiableSignals: Type.Array(Type.String({ minLength: 1, maxLength: 240 }), { minItems: 1, maxItems: 4 }),
  }, { additionalProperties: false }), { minItems: 1, maxItems: 30 }),
  competencies: Type.Array(Type.Object({ id: id(), name: Type.String({ minLength: 1, maxLength: 120 }), weight: Type.Number({ minimum: 0, maximum: 1 }), core: Type.Boolean() }, { additionalProperties: false }), { minItems: 4, maxItems: 7 }),
  fieldPlan: Type.Array(Type.Object({ fieldKind: Type.String({ pattern: "^[a-z][a-z0-9_]{0,49}$" }), competencyId: id(), name: Type.String({ minLength: 1, maxLength: 120 }),
    appliesToProjects: Type.Union([Type.Literal("all"), Type.Literal("relevant")]), importance: Type.Number({ minimum: 0, maximum: 1 }),
    requirementIds: Type.Array(id(), { uniqueItems: true }),
  }, { additionalProperties: false }), { minItems: 4, maxItems: 7 }),
  projectRelevance: Type.Record(Type.String(), Type.Array(id(), { uniqueItems: true })),
}, { additionalProperties: false });
export type RolePack = Static<typeof RolePackSchema>;
export const RequirementStatusSchema = Type.Union([Type.Literal("supported"), Type.Literal("partial"), Type.Literal("weak"), Type.Literal("contradicted"), Type.Literal("not_investigated")]);
export const RequirementMatrixSchema = Type.Array(Type.Object({ requirementId: id(), text: Type.String(), priority: Type.Union([Type.Literal("must"), Type.Literal("should"), Type.Literal("nice")]),
  status: RequirementStatusSchema,
  reachedDepth: Type.Optional(Type.Number()), evidenceIds: Type.Array(Type.String()), projectIds: Type.Array(Type.String()),
}));
export type RequirementMatrix = Static<typeof RequirementMatrixSchema>;
