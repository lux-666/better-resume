import { Type, type Static } from "typebox";
import type { InterviewProgress, InterviewState, InterviewStep } from "../../interview-core/src/index.ts";

const ClaimSchema = Type.Object({
  id: Type.String(),
  source: Type.Union([Type.Literal("resume"), Type.Literal("candidate_input"), Type.Literal("candidate_answer")]),
  text: Type.String(),
  sourceQuote: Type.Optional(Type.String()),
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

const ProjectSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  description: Type.String(),
  candidateRole: Type.Optional(Type.String()),
  technologies: Type.Array(Type.String()),
  outcomes: Type.Array(Type.String()),
  claims: Type.Array(ClaimSchema),
  mappedCompetencies: Type.Array(Type.String()),
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

const RoleCompetencySchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  weight: Type.Number({ minimum: 0, maximum: 1 }),
  core: Type.Boolean(),
}, { additionalProperties: false });

const InterviewRoleSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  source: Type.Union([Type.Literal("generic"), Type.Literal("job_description"), Type.Literal("legacy_role")]),
  description: Type.String(),
  requirements: Type.Array(Type.String()),
  competencies: Type.Array(RoleCompetencySchema),
}, { additionalProperties: false });

const CandidateProjectIntakeSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 160 }),
  description: Type.String({ minLength: 1, maxLength: 8_000 }),
}, { additionalProperties: false });

const CandidateIntakeSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
  skills: Type.Array(Type.String({ minLength: 1, maxLength: 80 }), { maxItems: 50 }),
  projects: Type.Array(CandidateProjectIntakeSchema, { minItems: 1, maxItems: 12 }),
}, { additionalProperties: false });

const JobIntakeSchema = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 120 }),
  introduction: Type.String({ minLength: 1, maxLength: 8_000 }),
  responsibilities: Type.String({ minLength: 1, maxLength: 12_000 }),
  requirements: Type.String({ minLength: 1, maxLength: 12_000 }),
}, { additionalProperties: false });

const InterviewIntakeSchema = Type.Object({
  candidate: CandidateIntakeSchema,
  job: Type.Optional(JobIntakeSchema),
}, { additionalProperties: false });

const ReportFieldSchema = Type.Object({
  id: Type.String(),
  projectId: Type.String(),
  competencyId: Type.String(),
  name: Type.String(),
  description: Type.String(),
  importance: Type.Number({ minimum: 0, maximum: 1 }),
  status: Type.Union([
    Type.Literal("missing"), Type.Literal("weak"),
    Type.Literal("supported"), Type.Literal("contradicted"),
  ]),
  summary: Type.Optional(Type.String()),
  evidenceIds: Type.Array(Type.String()),
}, { additionalProperties: false });

const ReportContradictionSchema = Type.Object({
  id: Type.String(),
  claimId: Type.String(),
  projectId: Type.Optional(Type.String()),
  status: Type.Union([Type.Literal("open"), Type.Literal("resolved")]),
  evidenceIds: Type.Array(Type.String()),
  resolutionEvidenceIds: Type.Array(Type.String()),
}, { additionalProperties: false });

const CandidateReportSchema = Type.Object({
  objective: Type.String(),
  status: Type.Union([Type.Literal("in_progress"), Type.Literal("complete")]),
  fields: Type.Array(ReportFieldSchema),
  contradictions: Type.Array(ReportContradictionSchema),
}, { additionalProperties: false });

const InterviewTurnSchema = Type.Object({
  id: Type.String(),
  index: Type.Integer({ minimum: 0 }),
  projectId: Type.Optional(Type.String()),
  reportFieldId: Type.Optional(Type.String()),
  acknowledgement: Type.Optional(Type.String()),
  question: Type.String(),
  answer: Type.String(),
  timestamp: Type.String(),
}, { additionalProperties: false });

export const EvidenceSchema = Type.Object({
  id: Type.String(),
  turnId: Type.String(),
  projectId: Type.Optional(Type.String()),
  reportFieldIds: Type.Array(Type.String()),
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

const TaskExecutionTraceSchema = Type.Object({
  source: Type.Union([Type.Literal("demo"), Type.Literal("llm")]),
  durationMs: Type.Number({ minimum: 0 }),
  retryCount: Type.Integer({ minimum: 0 }),
}, { additionalProperties: false });

const StepExecutionTraceSchema = Type.Object({
  mode: Type.Union([Type.Literal("demo"), Type.Literal("llm")]),
  provider: Type.Optional(Type.String()),
  modelId: Type.Optional(Type.String()),
  reportModelId: Type.Optional(Type.String()),
  interviewModelId: Type.Optional(Type.String()),
  evidence: Type.Optional(TaskExecutionTraceSchema),
  question: Type.Optional(TaskExecutionTraceSchema),
}, { additionalProperties: false });

export const InterviewActionSchema = Type.Union([
  Type.Literal("ASK_CANDIDATE"), Type.Literal("FINISH_INTERVIEW"),
]);

const DecisionTraceSchema = Type.Object({
  turnId: Type.Optional(Type.String()),
  action: InterviewActionSchema,
  targetFieldId: Type.Optional(Type.String()),
  reason: Type.String(),
  acknowledgement: Type.Optional(Type.String()),
  generatedQuestion: Type.Optional(Type.String()),
  completionBlockers: Type.Optional(Type.Array(Type.String())),
  execution: Type.Optional(StepExecutionTraceSchema),
}, { additionalProperties: false });

export const InterviewStateSchema = Type.Object({
  sessionId: Type.String(),
  roleId: Type.String(),
  role: InterviewRoleSchema,
  intake: InterviewIntakeSchema,
  status: Type.Union([Type.Literal("draft"), Type.Literal("active"), Type.Literal("completed")]),
  currentAcknowledgement: Type.Optional(Type.String()),
  currentQuestion: Type.Optional(Type.String()),
  candidate: CandidateProfileSchema,
  report: CandidateReportSchema,
  turns: Type.Array(InterviewTurnSchema),
  evidence: Type.Array(EvidenceSchema),
  competencies: Type.Array(CompetencyStateSchema),
  traces: Type.Array(DecisionTraceSchema),
}, { additionalProperties: false });

export const InterviewDecisionSchema = Type.Object({
  action: InterviewActionSchema,
  targetFieldId: Type.Optional(Type.String()),
  reason: Type.String(),
  acknowledgement: Type.Optional(Type.String()),
  question: Type.Optional(Type.String()),
}, { additionalProperties: false });

export const CreateInterviewBodySchema = Type.Object({
  candidate: CandidateIntakeSchema,
  job: Type.Optional(JobIntakeSchema),
}, { additionalProperties: false });

export const AnswerCommandSchema = Type.Object({
  commandId: Type.String({ minLength: 1, maxLength: 128 }),
  questionId: Type.String({ minLength: 1, maxLength: 128 }),
  expectedStateVersion: Type.Integer({ minimum: 0 }),
  answer: Type.String({ minLength: 1, maxLength: 10_000 }),
}, { additionalProperties: false });

export const ApiErrorSchema = Type.Object({
  code: Type.Union([
    Type.Literal("INVALID_REQUEST"), Type.Literal("NOT_FOUND"), Type.Literal("STATE_CONFLICT"),
    Type.Literal("MODEL_OUTPUT_INVALID"), Type.Literal("PROVIDER_UNAVAILABLE"),
    Type.Literal("INTERNAL_ERROR"),
  ]),
  message: Type.String(),
  retryable: Type.Boolean(),
}, { additionalProperties: false });

export const RuntimeInfoSchema = Type.Object({
  mode: Type.Union([Type.Literal("demo"), Type.Literal("llm")]),
  provider: Type.Optional(Type.String()),
  modelId: Type.Optional(Type.String()),
  reportModelId: Type.Optional(Type.String()),
  interviewModelId: Type.Optional(Type.String()),
}, { additionalProperties: false });

export const InterviewProgressSchema = Type.Object({
  stage: Type.Union([Type.Literal("not_started"), Type.Literal("interviewing"), Type.Literal("completed")]),
  coveragePercent: Type.Integer({ minimum: 0, maximum: 100 }),
  turns: Type.Object({ completed: Type.Integer({ minimum: 0 }), max: Type.Integer({ minimum: 1 }) }, { additionalProperties: false }),
  projects: Type.Object({ covered: Type.Integer({ minimum: 0 }), total: Type.Integer({ minimum: 0 }) }, { additionalProperties: false }),
  reportFields: Type.Object({ covered: Type.Integer({ minimum: 0 }), total: Type.Integer({ minimum: 0 }) }, { additionalProperties: false }),
  coreCompetencies: Type.Object({ covered: Type.Integer({ minimum: 0 }), total: Type.Integer({ minimum: 0 }) }, { additionalProperties: false }),
  contradictionsOpen: Type.Integer({ minimum: 0 }),
}, { additionalProperties: false });

export const InterviewStateResponseSchema = Type.Object({
  state: InterviewStateSchema,
  stateVersion: Type.Integer({ minimum: 0 }),
  runtime: RuntimeInfoSchema,
  progress: InterviewProgressSchema,
  questionId: Type.Optional(Type.String({ minLength: 1 })),
  pendingCommand: Type.Optional(AnswerCommandSchema),
}, { additionalProperties: false });

export const InterviewStepResponseSchema = Type.Object({
  state: InterviewStateSchema,
  stateVersion: Type.Integer({ minimum: 0 }),
  runtime: RuntimeInfoSchema,
  progress: InterviewProgressSchema,
  questionId: Type.Optional(Type.String({ minLength: 1 })),
  commandId: Type.Optional(Type.String({ minLength: 1 })),
  decision: InterviewDecisionSchema,
  question: Type.Optional(Type.String()),
  evidence: Type.Array(EvidenceSchema),
}, { additionalProperties: false });

export type CreateInterviewBody = Static<typeof CreateInterviewBodySchema>;
export type AnswerCommand = Static<typeof AnswerCommandSchema>;
export type ApiError = Static<typeof ApiErrorSchema>;
export type RuntimeInfo = Static<typeof RuntimeInfoSchema>;

export interface InterviewStateResponse {
  state: InterviewState;
  stateVersion: number;
  runtime: RuntimeInfo;
  progress: InterviewProgress;
  questionId?: string;
  pendingCommand?: AnswerCommand;
}

export interface InterviewStepResponse extends InterviewStateResponse {
  commandId?: string;
  decision: InterviewStep["decision"];
  question?: string;
  evidence: InterviewStep["evidence"];
}
