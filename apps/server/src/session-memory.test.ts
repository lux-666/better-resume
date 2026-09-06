import assert from "node:assert/strict";
import test from "node:test";
import { InterviewStore } from "./store.ts";
import { SessionMemory } from "./session-memory.ts";
import { createFixtureCandidate, createInterviewState, startInterview, submitAnswer } from "../../../packages/interview-core/src/index.ts";
import { fixedProfileResponse } from "../../../packages/interview-core/src/fixed-profiles.ts";
import { TelemetryCollector } from "../../../packages/pi-runtime/src/telemetry.ts";
function fixture() {
  const store = new InterviewStore(":memory:"); const state = createInterviewState("long-horizon", "role", createFixtureCandidate()); state.phaseVersion = 3; startInterview(state);
  while (state.status === "active") { const answer = fixedProfileResponse("strong", state); submitAnswer(state, answer.answer, answer.evidence, answer.disposition); }
  store.create(state); return { store, state };
}
test("session recall isolates sessions, reuses vectors, rebuilds deleted cache, and does not change State", async () => {
  const { store, state } = fixture(); let calls = 0;
  const early = "EARLY_UNIQUE_MECHANISM"; state.evidence[0].statement = early;
  const memory = new SessionMemory(store.database, { model: "test", fingerprint: "test", embed: async (texts) => { calls += texts.length; return texts.map((t) => t.includes(early) ? [1, 0] : [0, 1]); } });
  const before = JSON.stringify(state);
  try {
    const query = { query: early, scope: "evidence" as const, limit: 5 };
    const first = await memory.recall(state, query, {}); assert.equal(first[0].id, state.evidence[0].id);
    const after = calls; assert.deepEqual(await memory.recall(state, query, {}), first); assert.equal(calls, after + 1);
    store.database.exec("DELETE FROM session_chunks"); assert.deepEqual(await memory.recall(state, query, {}), first);
    assert.equal(JSON.stringify(state), before);
    const other = createInterviewState("other", "role", createFixtureCandidate()); store.create(other);
    assert.deepEqual(await memory.recall(other, query, {}), []);
    assert.deepEqual(await memory.recall(state, { ...query, projectId: state.candidate.projects[1].id }, {}).then((r) => r.filter((h) => h.projectId !== state.candidate.projects[1].id)), []);
  } finally { store.close(); }
});
test("opt-in resume has no State/telemetry plaintext, deletion prevents hits and late index writes", async () => {
  const { store, state } = fixture(); const collector = new TelemetryCollector({ sessionId: state.sessionId });
  const memory = new SessionMemory(store.database, { model: "test", fingerprint: "test", embed: async (texts) => texts.map(() => [1, 0]) });
  const raw = "PRIVATE_RESUME_TEXT 曾参与一个缓存系统";
  try {
    assert.deepEqual(await memory.recall(state, { query: "缓存", scope: "resume" }, {}), []);
    await memory.saveResume(state.sessionId, raw, collector);
    assert.equal(memory.resumeInfo(state.sessionId).resumeIndexed, true);
    const hits = await memory.recall(state, { query: "缓存", scope: "resume" }, { telemetry: collector }); assert.equal(hits[0].text, raw);
    assert.doesNotMatch(JSON.stringify(collector.trace), /PRIVATE_RESUME_TEXT/); assert.doesNotMatch(JSON.stringify(state), /PRIVATE_RESUME_TEXT/);
    memory.deleteResume(state.sessionId); assert.equal(memory.resumeInfo(state.sessionId).resumeIndexed, false);
    assert.deepEqual(await memory.recall(state, { query: "缓存", scope: "resume" }, {}), []);
    let release!: () => void; const wait = new Promise<void>((resolve) => { release = resolve; });
    const slow = new SessionMemory(store.database, { model: "slow", fingerprint: "slow", embed: async (texts) => { await wait; return texts.map(() => [1, 0]); } });
    const pending = slow.saveResume(state.sessionId, raw); slow.deleteResume(state.sessionId); release(); await assert.rejects(pending, /deleted/);
    assert.equal((store.database.prepare("SELECT count(*) AS n FROM session_chunks WHERE kind='resume'").get() as { n: number }).n, 0);
  } finally { store.close(); }
});
