import assert from "node:assert/strict";
import test from "node:test";
import { Check } from "typebox/value";
import { AnswerCommandSchema, ApiErrorSchema, InterviewStepResponseSchema } from "./index.ts";

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
  assert.equal(Check(InterviewStepResponseSchema, {
    state: {}, stateVersion: 2, questionId: "session:2",
    decision: {}, question: "下一步做了什么？", evidence: [],
  }), true);
});
