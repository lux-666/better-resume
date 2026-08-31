import { Type, type Static } from "typebox";
import type { InterviewState, InterviewStep } from "../../interview-core/src/index.ts";

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
  state: Type.Any(),
  stateVersion: Type.Integer({ minimum: 0 }),
  questionId: Type.Optional(Type.String({ minLength: 1 })),
}, { additionalProperties: false });

export const InterviewStepResponseSchema = Type.Object({
  state: Type.Any(),
  stateVersion: Type.Integer({ minimum: 0 }),
  questionId: Type.Optional(Type.String({ minLength: 1 })),
  commandId: Type.Optional(Type.String({ minLength: 1 })),
  decision: Type.Any(),
  question: Type.Optional(Type.String()),
  evidence: Type.Array(Type.Any()),
}, { additionalProperties: false });

export type CreateInterviewBody = Static<typeof CreateInterviewBodySchema>;
export type AnswerCommand = Static<typeof AnswerCommandSchema>;
export type ApiError = Static<typeof ApiErrorSchema>;

export interface InterviewStateResponse {
  state: InterviewState;
  stateVersion: number;
  questionId?: string;
}

export interface InterviewStepResponse extends InterviewStateResponse {
  commandId?: string;
  decision: InterviewStep["decision"];
  question?: string;
  evidence: InterviewStep["evidence"];
}
