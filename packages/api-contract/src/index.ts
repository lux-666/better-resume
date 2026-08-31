import { Type, type Static } from "typebox";
import type { InterviewState, InterviewStep } from "../../interview-core/src/index.ts";

const ClaimSchema = Type.Object({
  id: Type.String(),
  source: Type.Union([Type.Literal("resume"), Type.Literal("candidate_answer")]),
  text: Type.String(),
  projectId: Type.Optional(Type.String()),
  status: Type.Union([
    Type.Literal("unverified"), Type.Literal("supported"),
    Type.Literal("weakened"), Type.Literal("contradicted"),
  ]),
  relatedCompetencies: Type.Array(Type.String()),
  supportingEvidenceIds: Type.Array(Type.String()),
  weakEvidenceIds: Type.Array(Type.String()),
  contradictingEvidenceIds: Type.Array(Type.String()),
}, { additionalProperties: false });

const EvidenceGapSchema = Type.Object({
  competencyId: Type.String(),
  type: Type.String(),
  description: Type.String(),
  importance: Type.Number(),
  status: Type.Union([Type.Literal("open"), Type.Literal("resolved"), Type.Literal("low_value")]),
}, { additionalProperties: false });

const TopicThreadSchema = Type.Object({
  id: Type.String(),
  projectId: Type.String(),
  name: Type.String(),
  status: Type.Union([
    Type.Literal("candidate"), Type.Literal("active"),
    Type.Literal("paused"), Type.Literal("completed"),
  ]),
  summary: Type.String(),
  evidenceIds: Type.Array(Type.String()),
  unresolvedGaps: Type.Array(EvidenceGapSchema),
  pendingLeads: Type.Array(Type.String()),
  relatedCompetencies: Type.Array(Type.String()),
  turnIds: Type.Array(Type.String()),
  saturation: Type.Number(),
  expectedInformationGain: Type.Number(),
}, { additionalProperties: false });

const ProjectSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  description: Type.String(),
  candidateRole: Type.Optional(Type.String()),
  technologies: Type.Array(Type.String()),
  outcomes: Type.Array(Type.String()),
  claims: Type.Array(ClaimSchema),
  mappedCompetencies: Type.Array(Type.String()),
  topics: Type.Array(TopicThreadSchema),
  status: Type.Union([Type.Literal("unexplored"), Type.Literal("active"), Type.Literal("completed")]),
  roleRelevance: Type.Optional(Type.Number()),
}, { additionalProperties: false });

const CandidateProfileSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  education: Type.Array(Type.String()),
  experiences: Type.Array(Type.String()),
  projects: Type.Array(ProjectSchema),
  skills: Type.Array(Type.String()),
  claims: Type.Array(ClaimSchema),
}, { additionalProperties: false });

const InterviewTurnSchema = Type.Object({
  id: Type.String(),
  index: Type.Integer({ minimum: 0 }),
  projectId: Type.Optional(Type.String()),
  topicId: Type.Optional(Type.String()),
  acknowledgement: Type.Optional(Type.String()),
  question: Type.String(),
  answer: Type.String(),
  timestamp: Type.String(),
}, { additionalProperties: false });

export const EvidenceSchema = Type.Object({
  id: Type.String(),
  turnId: Type.String(),
  projectId: Type.Optional(Type.String()),
  topicId: Type.Optional(Type.String()),
  claimIds: Type.Array(Type.String()),
  competencyId: Type.String(),
  statement: Type.String(),
  polarity: Type.Union([Type.Literal("support"), Type.Literal("weakness"), Type.Literal("invalidate")]),
  strength: Type.Number({ minimum: 0, maximum: 1 }),
  specificity: Type.Number({ minimum: 0, maximum: 1 }),
  evaluatorConfidence: Type.Number({ minimum: 0, maximum: 1 }),
  sourceQuote: Type.String(),
}, { additionalProperties: false });

const CompetencyStateSchema = Type.Object({
  competencyId: Type.String(),
  score: Type.Optional(Type.Number()),
  confidence: Type.Number({ minimum: 0, maximum: 1 }),
  evidenceIds: Type.Array(Type.String()),
  missingEvidence: Type.Array(Type.String()),
  contradictoryEvidence: Type.Array(Type.String()),
}, { additionalProperties: false });

export const InterviewActionSchema = Type.Union([
  Type.Literal("CONTINUE_TOPIC"), Type.Literal("SWITCH_TOPIC"), Type.Literal("SWITCH_PROJECT"),
  Type.Literal("SCENARIO_PROBE"), Type.Literal("CLARIFY_CONTRADICTION"),
  Type.Literal("GENERAL_PROBE"), Type.Literal("FINISH"),
]);

const DecisionTraceSchema = Type.Object({
  turnId: Type.Optional(Type.String()),
  action: InterviewActionSchema,
  projectId: Type.Optional(Type.String()),
  topicId: Type.Optional(Type.String()),
  selectedSkill: Type.Optional(Type.String()),
  selectedProbe: Type.Optional(Type.String()),
  targetGap: Type.Optional(Type.String()),
  reason: Type.String(),
  acknowledgement: Type.Optional(Type.String()),
  generatedQuestion: Type.Optional(Type.String()),
}, { additionalProperties: false });

export const InterviewStateSchema = Type.Object({
  sessionId: Type.String(),
  roleId: Type.String(),
  status: Type.Union([Type.Literal("draft"), Type.Literal("active"), Type.Literal("completed")]),
  currentAcknowledgement: Type.Optional(Type.String()),
  currentQuestion: Type.Optional(Type.String()),
  candidate: CandidateProfileSchema,
  turns: Type.Array(InterviewTurnSchema),
  evidence: Type.Array(EvidenceSchema),
  competencies: Type.Array(CompetencyStateSchema),
  traces: Type.Array(DecisionTraceSchema),
}, { additionalProperties: false });

export const InterviewDecisionSchema = Type.Object({
  action: InterviewActionSchema,
  projectId: Type.Optional(Type.String()),
  topicId: Type.Optional(Type.String()),
  skill: Type.Optional(Type.String()),
  targetGap: Type.Optional(Type.String()),
  reason: Type.String(),
}, { additionalProperties: false });

export const CreateInterviewBodySchema = Type.Object({
  candidateName: Type.Optional(Type.String({ maxLength: 100 })),
}, { additionalProperties: false });

export const AnswerCommandSchema = Type.Object({
  commandId: Type.String({ minLength: 1, maxLength: 128 }),
  questionId: Type.String({ minLength: 1, maxLength: 128 }),
  expectedStateVersion: Type.Integer({ minimum: 0 }),
  answer: Type.String({ minLength: 1, maxLength: 10_000 }),
}, { additionalProperties: false });

export const ApiErrorSchema = Type.Object({
  code: Type.Union([
    Type.Literal("INVALID_REQUEST"),
    Type.Literal("NOT_FOUND"),
    Type.Literal("STATE_CONFLICT"),
    Type.Literal("MODEL_OUTPUT_INVALID"),
    Type.Literal("PROVIDER_UNAVAILABLE"),
    Type.Literal("INTERNAL_ERROR"),
  ]),
  message: Type.String(),
  retryable: Type.Boolean(),
}, { additionalProperties: false });

export const InterviewStateResponseSchema = Type.Object({
  state: InterviewStateSchema,
  stateVersion: Type.Integer({ minimum: 0 }),
  questionId: Type.Optional(Type.String({ minLength: 1 })),
  pendingCommand: Type.Optional(AnswerCommandSchema),
}, { additionalProperties: false });

export const InterviewStepResponseSchema = Type.Object({
  state: InterviewStateSchema,
  stateVersion: Type.Integer({ minimum: 0 }),
  questionId: Type.Optional(Type.String({ minLength: 1 })),
  commandId: Type.Optional(Type.String({ minLength: 1 })),
  decision: InterviewDecisionSchema,
  question: Type.Optional(Type.String()),
  evidence: Type.Array(EvidenceSchema),
}, { additionalProperties: false });

export type CreateInterviewBody = Static<typeof CreateInterviewBodySchema>;
export type AnswerCommand = Static<typeof AnswerCommandSchema>;
export type ApiError = Static<typeof ApiErrorSchema>;

export interface InterviewStateResponse {
  state: InterviewState;
  stateVersion: number;
  questionId?: string;
  pendingCommand?: AnswerCommand;
}

export interface InterviewStepResponse extends InterviewStateResponse {
  commandId?: string;
  decision: InterviewStep["decision"];
  question?: string;
  evidence: InterviewStep["evidence"];
}
