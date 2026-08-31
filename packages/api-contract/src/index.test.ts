import assert from "node:assert/strict";
import test from "node:test";
import { Check } from "typebox/value";
import { createFixtureCandidate, createInterviewState, startInterview } from "../../interview-core/src/index.ts";
import {
  AnswerCommandSchema,
  ApiErrorSchema,
  InterviewStateResponseSchema,
  InterviewStepResponseSchema,
} from "./index.ts";

test("HTTP command and error envelopes are executable contracts", () => {
  assert.equal(Check(AnswerCommandSchema, {
    commandId: "command-1",
    questionId: "session:1",
    expectedStateVersion: 1,
    answer: "我负责召回模块。",
  }), true);
  assert.equal(Check(AnswerCommandSchema, { answer: "missing command context" }), false);
  assert.equal(Check(ApiErrorSchema, {
    code: "STATE_CONFLICT",
    message: "Question is stale",
    retryable: false,
  }), true);
  const state = createInterviewState("session", "role", createFixtureCandidate());
  const step = startInterview(state);
  const response = {
    state, stateVersion: 1, questionId: "session:1",
    decision: step.decision, question: step.question, evidence: step.evidence,
  };
  assert.equal(Check(InterviewStepResponseSchema, response), true);
  assert.equal(Check(InterviewStateResponseSchema, {
    state,
    stateVersion: 1,
    questionId: "session:1",
    pendingCommand: {
      commandId: "command-1",
      questionId: "session:1",
      expectedStateVersion: 1,
      answer: "待恢复的回答",
    },
  }), true);
  assert.equal(Check(InterviewStepResponseSchema, {
    ...response,
    state: { ...state, traces: [{ ...state.traces[0], action: "INVENTED_ACTION" }] },
  }), false);
});
