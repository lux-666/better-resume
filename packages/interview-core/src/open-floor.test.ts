import assert from "node:assert/strict";
import test from "node:test";
import { Check } from "typebox/value";
import { InterviewStateSchema } from "../../api-contract/src/index.ts";
import { createFixtureCandidate, createInterviewState, startInterview, submitAnswer, getInterviewProgress, validateCompletion } from "./index.ts";
import { fixedProfileResponse } from "./fixed-profiles.ts";

function invitation() {
  const state = createInterviewState("open-floor", "role", createFixtureCandidate());
  state.maxTurns = 20;
  startInterview(state);
  while (!state.openFloor) {
    const response = fixedProfileResponse("strong", state);
    submitAnswer(state, response.answer, response.evidence, response.disposition);
  }
  return state;
}
test("completion invites new strengths; a new topic gets its own evidence and follow-up", () => {
  const state = invitation();
  assert.equal(state.status, "active");
  assert.match(state.currentQuestion!, /补充/);
  assert.equal(getInterviewProgress(state, []).turns.max, 20);
  const previous = state.candidate.projects.map((p) => p.id);
  const step = submitAnswer(state, "我还独立设计了校园活动报名系统，因为峰值排队所以采用限流");
  const turn = state.turns.at(-1)!;
  assert.equal(state.openFloor, false);
  assert.ok(!previous.includes(turn.projectId!));
  assert.equal(step.evidence[0].projectId, turn.projectId);
  assert.ok(state.report.fields.find((f) => f.id === step.decision.targetFieldId)?.projectId === turn.projectId);
  assert.equal(Check(InterviewStateSchema, state), true);
});
test("candidate questions do not edit capability evidence and explicit closing ends discussion", () => {
  const state = invitation(); const count = state.evidence.length;
  submitAnswer(state, "请问我应该怎样准备后续面试？");
  assert.equal(state.status, "active"); assert.equal(state.openFloor, true);
  assert.equal(state.evidence.length, count);
  assert.equal(state.turns.at(-1)?.kind, "discussion");
  assert.ok(state.turns.at(-1)?.interviewerResponse);
  submitAnswer(state, "没有了");
  assert.equal(state.status, "completed");
  assert.equal(state.evidence.length, count);
});
test("time is a reminder while the configured turn cap still terminates", () => {
  const state = createInterviewState("budget", "role", createFixtureCandidate());
  state.maxTurns = 5; state.timeBudgetMinutes = 20;
  state.startedAt = new Date(Date.now() - 21 * 60_000).toISOString();
  assert.equal(validateCompletion(state).forced, false);
  startInterview(state);
  for (let i = 0; i < 5; i++) {
    const response = fixedProfileResponse("strong", state);
    submitAnswer(state, response.answer, response.evidence, response.disposition);
    assert.equal(state.status, i < 4 ? "active" : "completed");
  }
  assert.equal(state.turns.length, 5); assert.equal(validateCompletion(state).forced, true);
});
