import assert from "node:assert/strict";
import test from "node:test";
import { Check } from "typebox/value";
import { createFixtureCandidate, createInterviewState, getInterviewProgress, startInterview } from "../../interview-core/src/index.ts";
import {
  AnswerCommandSchema,
  ApiErrorSchema,
  CreateInterviewBodySchema,
  InterviewStateResponseSchema,
  InterviewStepResponseSchema,
} from "./index.ts";

test("HTTP command and error envelopes are executable contracts", () => {
  assert.equal(Check(CreateInterviewBodySchema, {
    candidate: {
      name: "林青",
      skills: ["Go", "PostgreSQL"],
      projects: [{
        name: "订单服务改造",
        description: "作为核心开发重构交易链路，延迟降低 35%。",
      }],
    },
    job: {
      title: "支付平台工程师",
      introduction: "负责支付平台核心系统。",
      responsibilities: "设计高并发交易链路。",
      requirements: "熟悉 Go。",
    },
  }), true);
  assert.equal(Check(CreateInterviewBodySchema, {
    candidate: { name: "无项目", skills: [], projects: [] },
  }), false);
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
  const runtime = { mode: "demo" as const };
  assert.equal(Check(InterviewStateResponseSchema, {
    state,
    stateVersion: 1,
    runtime: {
      mode: "llm",
      provider: "openai_compatible",
      reportModelId: "gpt-5.6-terra",
      interviewModelId: "gpt-5.6-sol",
    },
    progress: getInterviewProgress(state, ["software_engineering"]),
  }), true);
  const progress = getInterviewProgress(state, ["software_engineering"]);
  const response = {
    state, stateVersion: 1, questionId: "session:1",
    runtime, progress,
    decision: step.decision, question: step.question, evidence: step.evidence,
  };
  assert.equal(Check(InterviewStepResponseSchema, response), true);
  assert.equal(Check(InterviewStateResponseSchema, {
    state,
    stateVersion: 1,
    runtime,
    progress,
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
