import { Type } from "typebox";
export const DepthLevelSchema = Type.Union([Type.Literal(1), Type.Literal(2), Type.Literal(3), Type.Literal(4), Type.Literal(5)]);
export const DispositionSchema = Type.Union([Type.Literal("substantive"), Type.Literal("vague"), Type.Literal("denial"), Type.Literal("contradiction"), Type.Literal("irrelevant"), Type.Literal("question_back"), Type.Literal("skip_request")]);
export const LeadProposalSchema = Type.Object({
  kind: Type.Union([Type.Literal("mechanism"), Type.Literal("metric"), Type.Literal("decision"), Type.Literal("constraint"), Type.Literal("failure"), Type.Literal("person_boundary")]),
  text: Type.String({ minLength: 1, maxLength: 120 }), suggestedFieldId: Type.Optional(Type.String()),
}, { additionalProperties: false });
export const LeadSchema = Type.Object({ ...LeadProposalSchema.properties, id: Type.String(), turnId: Type.String(), projectId: Type.String() }, { additionalProperties: false });
export const FieldConclusionSchema = Type.Object({
  supportStatements: Type.Array(Type.String()), weaknessStatements: Type.Array(Type.String()), invalidateStatements: Type.Array(Type.String()),
  reachedDepth: Type.Optional(DepthLevelSchema),
  boundaryReason: Type.Optional(Type.Object({ depthLevel: DepthLevelSchema, sourceQuote: Type.String(), evidenceId: Type.String() })),
}, { additionalProperties: false });
export const ProjectedLeadSchema = Type.Object({ ...LeadSchema.properties,
  status: Type.Union([Type.Literal("open"), Type.Literal("followed"), Type.Literal("dropped")]), followedByDecisionIndex: Type.Optional(Type.Integer({ minimum: 0 })),
}, { additionalProperties: false });
