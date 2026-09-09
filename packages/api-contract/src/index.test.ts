import assert from "node:assert/strict";
import test from "node:test";
import { Check } from "typebox/value";
import { createFixtureCandidate, createInterviewState, getInterviewProgress, startInterview } from "../../interview-core/src/index.ts";
import {
  AnswerCommandSchema,
  ApiErrorSchema,
  CreateInterviewBodySchema,
  getCreateInterviewError,
  InterviewStateResponseSchema,
  InterviewStepResponseSchema,
  InterviewReportResponseSchema,
} from "./index.ts";
import { buildInterviewReportBundle } from "../../interview-core/src/index.ts";

test("create validation identifies invalid fields without truncating input", () => {
  const candidate = { name: "测试", skills: Array.from({ length: 53 }, (_, index) => `技能${index}`), projects: [{ name: "项目", description: "开发经历" }] };
  assert.match(getCreateInterviewError({ candidate })!, /技能最多 50 项/);
  assert.equal(candidate.skills.length, 53);
  assert.equal(getCreateInterviewError({ candidate: { ...candidate, skills: candidate.skills.slice(0, 50) } }), undefined);
  const valid = { candidate: { ...candidate, skills: ["Go"] } };
  assert.match(getCreateInterviewError({ candidate: { ...valid.candidate, skills: ["a".repeat(81)] } })!, /技能第 1项不能超过 80/);
  assert.match(getCreateInterviewError({ candidate: { ...valid.candidate, projects: [{ name: "项目", description: "a".repeat(8001) }] } })!, /项目 1的经历不能超过 8000/);
  assert.match(getCreateInterviewError({ ...valid, maxTurns: 51 })!, /轮次上限不能大于 50/);
  assert.match(getCreateInterviewError({ ...valid, job: { title: "岗位", introduction: "介绍", responsibilities: "职责", requirements: "a".repeat(12001) } })!, /任职要求不能超过 12000/);
});

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
  assert.equal(Check(InterviewReportResponseSchema, buildInterviewReportBundle(state, {
    generatedAt: "2026-09-02T00:00:00.000Z",
  })), true);
});
