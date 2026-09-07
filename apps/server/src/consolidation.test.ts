import assert from "node:assert/strict";
import test from "node:test";
import { Check } from "typebox/value";
import { InterviewStore } from "./store.ts";
import { InterviewStateSchema, InterviewStateResponseSchema, InterviewStepResponseSchema } from "../../../packages/api-contract/src/index.ts";
import { buildInterviewReportBundle, createFixtureCandidate, createInterviewState, getInterviewProgress } from "../../../packages/interview-core/src/index.ts";
import { buildSummary } from "../../../packages/interview-core/src/memory.ts";
test("legacy persisted summaries are ignored without changing accepted session facts or report", () => {
  const store = new InterviewStore(":memory:"); const state = createInterviewState("legacy-summary", "role", createFixtureCandidate());
  const legacy = { ...state, memory: { summary: { version: 99, invented: "false fact" } } };
  try {
    store.create(legacy);
    const loaded = store.load(state.sessionId)!;
    assert.equal("memory" in loaded, false); assert.deepEqual(loaded, state); assert.ok(Check(InterviewStateSchema, loaded));
    assert.deepEqual(buildInterviewReportBundle(loaded, { generatedAt: "fixed" }), buildInterviewReportBundle(state, { generatedAt: "fixed" }));
    assert.equal(buildSummary(loaded).version, 0);
    store.save(loaded, 0); assert.doesNotMatch((store.database.prepare("SELECT state FROM sessions").get() as { state: string }).state, /false fact/);
  } finally { store.close(); }
});
test("state and step response share pending-command and resume metadata validation", () => {
  const state = createInterviewState("response", "role", createFixtureCandidate());
  const response = { state, stateVersion: 0, runtime: { mode: "demo" }, progress: getInterviewProgress(state, []), resume: { resumeIndexed: false, chunkCount: 0 },
    pendingCommand: { commandId: "pending", questionId: "q1", expectedStateVersion: 0, answer: "kept" } };
  assert.ok(Check(InterviewStateResponseSchema, response));
  assert.ok(Check(InterviewStepResponseSchema, { ...response, decision: { action: "FINISH_INTERVIEW", reason: "complete" }, evidence: [] }));
  const invalid = { ...response, pendingCommand: { ...response.pendingCommand, expectedStateVersion: -1 } };
  assert.equal(Check(InterviewStateResponseSchema, invalid), false);
  assert.equal(Check(InterviewStepResponseSchema, { ...invalid, decision: { action: "FINISH_INTERVIEW", reason: "complete" }, evidence: [] }), false);
});
test("legacy completed-command replay discards only retired summary and remains schema-valid and idempotent", () => {
  const store = new InterviewStore(":memory:"); const state = createInterviewState("legacy-replay", "role", createFixtureCandidate());
  const cmd = { commandId: "old-command", questionId: "q1", expectedStateVersion: 0, answer: "original answer" };
  const response = { state: { ...state, memory: { summary: { version: 999, invented: "FORGED_CACHE" } } }, stateVersion: 0, runtime: { mode: "demo" },
    progress: getInterviewProgress(state, []), decision: { action: "FINISH_INTERVIEW", reason: "historical decision" }, evidence: [], commandId: cmd.commandId };
  try {
    store.create(state);
    store.database.prepare("INSERT INTO answer_commands(session_id,command_id,question_id,expected_state_version,answer,status,response,created_at) VALUES(?,?,?,?,?,'completed',?,?)")
      .run(state.sessionId, cmd.commandId, cmd.questionId, 0, cmd.answer, JSON.stringify(response), "2026-01-01");
    const first = store.claim(state, cmd).replay!;
    assert.equal("memory" in first.state, false); assert.ok(Check(InterviewStepResponseSchema, first));
    assert.deepEqual(first, { ...response, state }); assert.deepEqual(store.claim(state, cmd).replay, first);
    assert.equal(store.load(state.sessionId)?.turns.length, 0);
    assert.match((store.database.prepare("SELECT response FROM answer_commands").get() as { response: string }).response, /FORGED_CACHE/);
  } finally { store.close(); }
});
