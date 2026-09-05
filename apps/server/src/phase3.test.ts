import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { Check } from "typebox/value";
import { createModels, fauxProvider, fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { createApplication } from "./application.ts";
import { InterviewStore } from "./store.ts";
import { createFixtureCandidate, createInterviewState, startInterview, submitAnswer } from "../../../packages/interview-core/src/index.ts";
import { fixedProfileResponse } from "../../../packages/interview-core/src/fixed-profiles.ts";
import { InterviewReportResponseSchema, type AnswerCommand } from "../../../packages/api-contract/src/index.ts";
import { type RuntimeSet } from "./configured-runtimes.ts";
const demo: RuntimeSet = { report: { mode: "demo" }, interview: { mode: "demo" }, info: { mode: "demo" } };
const quote = "PRIVATE_ANSWER 我使用固定样本对照确认结果";
function active(id = "session") { const state = createInterviewState(id, "role", createFixtureCandidate()); startInterview(state); return state; }
function command(state: ReturnType<typeof active>, intent?: AnswerCommand["intent"]): AnswerCommand {
  return { commandId: crypto.randomUUID(), questionId: `${state.sessionId}:${state.traces.length}`, expectedStateVersion: state.traces.length, answer: quote, ...(intent ? { intent } : {}) };
}
function reportRuntime(before: () => Promise<void>): RuntimeSet {
  const faux = fauxProvider();
  const models = createModels(); models.setProvider(faux.provider);
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("read_report", {}), { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxToolCall("edit_report", { answerDisposition: "substantive", leads: [], evidence: [{
      reportFieldIds: ["project_enterprise_rag:ownership"], claimIds: [], competencyId: "software_engineering", statement: "说明了样本对照", polarity: "support",
      strength: .9, specificity: .9, evaluatorConfidence: .9, sourceQuote: quote, depthLevel: 3,
    }] }), { stopReason: "toolUse" }),
  ]);
  return { ...demo, report: { mode: "llm", model: faux.getModel(), streamFn: async (...args) => { await before(); return models.streamSimple(...args); } }, info: { mode: "llm" } };
}
async function fixture(t: { after(fn: () => unknown): void }, runtimes = demo, deadlineMs?: number) {
  const dir = mkdtempSync(join(tmpdir(), "phase3-"));
  const app = createApplication({ databasePath: join(dir, "test.db"), runtimes, deadlineMs });
  app.server.listen(0, "127.0.0.1"); await once(app.server, "listening");
  const address = app.server.address(); if (!address || typeof address === "string") throw new Error("Missing address");
  const url = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await app.close(); rmSync(dir, { recursive: true, force: true }); });
  return { ...app, url, get: async (path: string) => (await fetch(url + path)).json(), post: async (path: string, body: object) => {
    const response = await fetch(url + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  } };
}
test("expired owner cannot release or commit a reclaimed command", () => {
  const dir = mkdtempSync(join(tmpdir(), "phase3-owner-")); const store = new InterviewStore(join(dir, "db"));
  try {
    const state = active(); store.create(state); const cmd = command(state); const first = store.claim(state, cmd);
    store.database.prepare("UPDATE answer_commands SET lease_expires_at=0").run();
    const second = store.claim(state, cmd); assert.notEqual(second.owner, first.owner);
    store.release(state.sessionId, cmd.commandId, first.owner);
    const row = store.database.prepare("SELECT lease_owner FROM answer_commands").get() as { lease_owner: string }; assert.equal(row.lease_owner, second.owner);
    assert.throws(() => store.complete(state, cmd, first.owner, {} as never), /lease was lost/);
    assert.equal(store.load(state.sessionId)?.turns.length, 0);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
test("20-second model wait exposes safe progress before the POST finishes; observer disconnect does not cancel", { timeout: 30_000 }, async (t) => {
  let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  const app = await fixture(t, reportRuntime(() => held)); const state = active("slow"); app.store.create(state);
  let settled = false;
  const submitted = app.post("/api/interviews/slow/answer", command(state)).then((result) => { settled = true; return result; });
  let progress: any[] = [];
  for (let i = 0; i < 100; i++) { progress = await app.get("/api/interviews/slow/progress"); if (progress.some((run) => run.stage === "report")) break; await new Promise((r) => setTimeout(r, 10)); }
  assert.equal(settled, false); assert.equal(progress.at(-1).status, "running");
  assert.doesNotMatch(JSON.stringify(progress), /PRIVATE_ANSWER|sourceQuote|software_engineering|report_agent/);
  const events = await fetch(app.url + "/api/interviews/slow/events"); const reader = events.body!.getReader();
  const first = await reader.read(); assert.match(new TextDecoder().decode(first.value), /event: snapshot/); await reader.cancel();
  await new Promise((resolve) => setTimeout(resolve, 20_100));
  assert.equal(settled, false); assert.equal(app.store.load("slow")?.turns.length, 0);
  const elapsed = await app.get("/api/interviews/slow/progress"); assert.ok(elapsed.at(-1).elapsedMs >= 20_000);
  release(); const result = await submitted; assert.equal(result.status, 200); assert.equal(result.body.state.turns.length, 1);
  const stats = await app.get("/api/interviews/slow/telemetry"); assert.equal(stats.summary.modelRequestCount, 2); assert.equal(stats.summary.providerRetryCount, 0);
  assert.equal(stats.traces.at(-1).status, "succeeded"); assert.ok(stats.traces.at(-1).durationMs >= 20_000);
});
test("whole-command timeout releases ownership, keeps raw answer, and prevents late mutation", { timeout: 5000 }, async (t) => {
  let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  const app = await fixture(t, reportRuntime(() => held), 80); const state = active("timeout"); app.store.create(state); const cmd = command(state);
  const response = await app.post("/api/interviews/timeout/answer", cmd);
  assert.equal(response.status, 503); assert.equal(app.store.load("timeout")?.turns.length, 0);
  assert.equal((await app.get("/api/interviews/timeout/state")).pendingCommand.answer, quote);
  assert.equal((await app.get("/api/interviews/timeout/traces")).at(-1).status, "timed_out");
  const row = app.store.database.prepare("SELECT lease_owner FROM answer_commands").get() as { lease_owner: string | null }; assert.equal(row.lease_owner, null);
  release(); await new Promise((resolve) => setTimeout(resolve, 50)); assert.equal(app.store.load("timeout")?.turns.length, 0);
});
test("clarification commands replay exactly and do not consume a turn; skip has an immutable intent", async (t) => {
  const app = await fixture(t); const state = active("clarification"); app.store.create(state); const cmd = command(state, "clarify");
  const first = await app.post("/api/interviews/clarification/answer", cmd); assert.equal(first.status, 200); assert.equal(first.body.state.turns.length, 0);
  assert.equal(first.body.state.currentQuestion, state.currentQuestion);
  assert.deepEqual((await app.post("/api/interviews/clarification/answer", cmd)).body, first.body);
  const changed = await app.post("/api/interviews/clarification/answer", { ...cmd, intent: "skip" }); assert.equal(changed.status, 409);
  const repeated = await app.post("/api/interviews/clarification/answer", command(first.body.state, "clarify")); assert.equal(repeated.status, 400);
  const skip = await app.post("/api/interviews/clarification/answer", command(first.body.state, "skip")); assert.equal(skip.status, 200);
  assert.equal(skip.body.state.turns.length, 1); assert.equal(skip.body.evidence[0].polarity, "weakness");
});
test("a repeated free-text clarification is terminally rejected without locking the question", async (t) => {
  const faux = fauxProvider(); const models = createModels(); models.setProvider(faux.provider);
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("read_report", {}), { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxToolCall("edit_report", { answerDisposition: "question_back", evidence: [] }), { stopReason: "toolUse" }),
  ]);
  const app = await fixture(t, { ...demo, report: { mode: "llm", model: faux.getModel(), streamFn: models.streamSimple.bind(models) } });
  const state = active("repeat-clarification"); app.store.create(state);
  const first = await app.post("/api/interviews/repeat-clarification/answer", command(state, "clarify"));
  const repeat = command(first.body.state);
  const rejected = await app.post("/api/interviews/repeat-clarification/answer", repeat);
  assert.equal(rejected.status, 400);
  assert.deepEqual(await app.post("/api/interviews/repeat-clarification/answer", repeat), rejected);
  const restored = await app.get("/api/interviews/repeat-clarification/state");
  assert.equal(restored.pendingCommand, undefined);
  assert.equal(restored.state.turns.length, 0); assert.equal(restored.state.clarifications.length, 1);
  assert.equal((await app.post("/api/interviews/repeat-clarification/answer", command(restored.state, "skip"))).status, 200);
});
test("legacy command migration preserves payloads, leases and idempotent responses", () => {
  const dir = mkdtempSync(join(tmpdir(), "phase3-migration-")); const path = join(dir, "db");
  const database = new DatabaseSync(path);
  database.exec(`CREATE TABLE answer_commands(session_id TEXT NOT NULL,command_id TEXT NOT NULL,question_id TEXT NOT NULL,
    expected_state_version INTEGER NOT NULL,answer TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','completed')),
    response TEXT,lease_owner TEXT,lease_expires_at INTEGER,created_at TEXT NOT NULL,PRIMARY KEY(session_id,command_id),UNIQUE(session_id,question_id));
    INSERT INTO answer_commands VALUES('migration','command','migration:1',1,'original','completed','{"commandId":"command"}',NULL,NULL,'2026-01-01');`);
  database.close(); const store = new InterviewStore(path);
  try {
    const row = store.database.prepare("SELECT * FROM answer_commands").get() as { answer: string; intent: string; response: string };
    assert.equal(row.answer, "original"); assert.equal(row.intent, "answer");
    assert.deepEqual(store.claim(active("migration"), { commandId: "command", questionId: "migration:1", expectedStateVersion: 1, answer: "original" }).replay, { commandId: "command" });
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
test("report narrative, inline/download facts, supplement and regeneration share an accepted state version", async (t) => {
  const app = await fixture(t); const state = active("report");
  while (state.status === "active") { const answer = fixedProfileResponse("strong", state); submitAnswer(state, answer.answer, answer.evidence, answer.disposition); }
  app.store.create(state);
  await app.get("/api/interviews/report/report");
  let bundle: any;
  for (let i = 0; i < 30; i++) { bundle = await app.get("/api/interviews/report/report"); if (bundle.report.narrativeStatus === "ready") break; await new Promise((r) => setTimeout(r, 10)); }
  assert.equal(bundle.report.narrativeStatus, "ready"); assert.ok(Check(InterviewReportResponseSchema, bundle));
  assert.deepEqual(bundle, await app.get("/api/interviews/report/report"));
  const body = { commandId: "supplement", questionId: "report:supplement:project_enterprise_rag", expectedStateVersion: state.traces.length,
    answer: "我又补充了基于固定样本对照的验收记录。", projectId: "project_enterprise_rag" };
  const supplemented = await app.post("/api/interviews/report/supplement", body); assert.equal(supplemented.status, 200);
  assert.equal(supplemented.body.state.turns.at(-1).kind, "supplement"); assert.equal(supplemented.body.progress.turns.completed, state.turns.length);
  assert.deepEqual((await app.post("/api/interviews/report/supplement", body)).body, supplemented.body);
  const final = await app.get("/api/interviews/report/report"); assert.equal(final.report.narrativeSourceVersion, state.traces.length + 1);
});
