import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { createModels, fauxProvider, fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { createApplication } from "./application.ts";
import { runModelStage } from "./model-stage.ts";
import { EvidenceValidationError, ModelProviderError } from "../../../packages/pi-runtime/src/index.ts";
import { TelemetryCollector } from "../../../packages/pi-runtime/src/telemetry.ts";
import { createFixtureCandidate, createInterviewState, startInterview } from "../../../packages/interview-core/src/index.ts";
import type { RuntimeSet } from "./configured-runtimes.ts";
const demo: RuntimeSet = { report: { mode: "demo" }, interview: { mode: "demo" }, info: { mode: "demo" } };
const intake = { candidate: { name: "历史测试", skills: [], projects: [{ name: "缓存服务", description: "参与实现缓存更新" }] } };
async function serve(app: ReturnType<typeof createApplication>) {
  await app.ready; app.server.listen(0, "127.0.0.1"); await once(app.server, "listening");
  const address = app.server.address(); if (!address || typeof address === "string") throw new Error("No address");
  return async (path: string, method = "GET", body?: object) => {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() as any };
  };
}
test("local HTTP history survives restart, exports committed conversation and cascades deletion with resume opt-in", async () => {
  const root = mkdtempSync(join(tmpdir(), "phase4-http-"));
  const options = { databasePath: join(root, "db"), knowledgeRoot: root, runtimes: demo,
    embedding: { model: "test", fingerprint: "test", embed: async (texts: string[]) => texts.map(() => [1, 0]) } };
  let app = createApplication(options);
  try {
    let request = await serve(app);
    for (const resume of [{ text: "私人简历" }, { consent: false, text: "私人简历" }]) assert.equal((await request("/api/interviews", "POST", { ...intake, resume })).status, 400);
    const plain = await request("/api/interviews", "POST", intake); assert.equal(plain.status, 201); assert.equal(plain.body.resume.resumeIndexed, false);
    const created = await request("/api/interviews", "POST", { ...intake, timeBudgetMinutes: 20, resume: { consent: true, text: "PRIVATE_RESUME 材料" } });
    const id = created.body.state.sessionId; const base = `/api/interviews/${id}`;
    assert.equal(created.status, 201); assert.equal(created.body.resume.resumeIndexed, true); assert.equal(created.body.state.timeBudgetMinutes, 20);
    assert.doesNotMatch(JSON.stringify(created.body.state), /PRIVATE_RESUME/);
    const started = await request(base + "/start", "POST"); const cmd = { commandId: "skip", questionId: started.body.questionId, expectedStateVersion: started.body.stateVersion, answer: "我想跳过这个问题。", intent: "skip" };
    assert.equal((await request(base + "/answer", "POST", cmd)).status, 200);
    const exported = await request(base + "/export"); assert.equal(exported.body.state.turns.length, 1); assert.equal(exported.body.commands.length, 1); assert.ok(exported.body.traces.length >= 3);
    assert.doesNotMatch(JSON.stringify(exported.body), /PRIVATE_RESUME/);
    const original = (await request(base + "/state")).body.state;
    assert.equal((await request(base + "/resume-index", "DELETE")).status, 200); assert.deepEqual((await request(base + "/state")).body.state, original);
    await app.close(); app = createApplication(options); request = await serve(app);
    assert.equal((await request("/api/interviews")).body.sessions.length, 2);
    assert.deepEqual((await request(base + "/state")).body.state, original);
    const current = app.store.load(id)!; const live = { commandId: "held", questionId: `${id}:${current.traces.length}`, expectedStateVersion: current.traces.length, answer: "新的回答" }; const claim = app.store.claim(current, live);
    assert.equal((await request(base, "DELETE")).status, 409); app.store.release(id, live.commandId, claim.owner);
    assert.equal((await request(base, "DELETE")).status, 200); assert.equal((await request(base + "/state")).status, 404);
    for (const table of ["answer_commands", "telemetry_traces", "report_narratives", "session_chunks", "session_documents"]) assert.equal((app.store.database.prepare(`SELECT count(*) AS n FROM ${table} WHERE session_id=?`).get(id) as { n: number }).n, 0);
    assert.equal((await request("/api/interviews")).body.sessions.length, 1);
    assert.equal((await request("/api/metrics")).status, 200);
  } finally { await app.close(); rmSync(root, { recursive: true, force: true }); }
});
test("stage retries provider failures, falls back once for validation/timeout, and respects global cancellation", async () => {
  for (const failure of [new ModelProviderError("test"), new EvidenceValidationError("test")]) {
    const collector = new TelemetryCollector(); const seen: string[] = [];
    const result = await runModelStage({ primary: { mode: "llm", modelId: "primary" }, fallback: { mode: "llm", modelId: "backup" }, telemetry: collector, signal: new AbortController().signal,
      invoke: async (runtime) => { seen.push(runtime.modelId!); if (runtime.modelId === "primary") throw failure; return "accepted"; } });
    assert.equal(result.value, "accepted"); assert.equal(result.fallbackUsed, true);
    assert.deepEqual(seen, failure instanceof ModelProviderError ? ["primary", "primary", "backup"] : ["primary", "backup"]);
    assert.equal(collector.trace.spans.find((s) => s.fallback)?.fallback?.adopted, true);
  }
  const timeout = await runModelStage({ primary: { mode: "llm", modelId: "primary" }, fallback: { mode: "llm", modelId: "backup" }, primaryTimeoutMs: 10, telemetry: new TelemetryCollector(), signal: new AbortController().signal,
    invoke: async (runtime, _, signal) => { if (runtime.modelId === "backup") return "recovered"; await new Promise((resolve) => setTimeout(resolve, 30)); signal.throwIfAborted(); return "late"; } });
  assert.equal(timeout.value, "recovered");
  const abort = new AbortController(); abort.abort(); let calls = 0;
  await assert.rejects(runModelStage({ primary: demo.report, fallback: demo.report, telemetry: new TelemetryCollector(), signal: abort.signal, invoke: async () => { calls++; return "wrong"; } })); assert.equal(calls, 0);
});
test("backup report commits one answer, exact command replay has no new evidence or model calls", async () => {
  const root = mkdtempSync(join(tmpdir(), "phase4-fallback-"));
  const faux = fauxProvider(); const models = createModels(); models.setProvider(faux.provider);
  const quote = "我使用固定样本对照确认结果";
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("read_report", {}), { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxToolCall("edit_report", { answerDisposition: "substantive", leads: [], evidence: [{ reportFieldIds: ["project_enterprise_rag:ownership"], claimIds: [], competencyId: "software_engineering", statement: quote, polarity: "support", strength: .9, specificity: .9, evaluatorConfidence: .9, sourceQuote: quote, depthLevel: 3 }] }), { stopReason: "toolUse" }),
  ]);
  let failedCalls = 0;
  const app = createApplication({ databasePath: join(root, "db"), runtimes: { ...demo,
    report: { mode: "llm", modelId: "primary", model: faux.getModel(), streamFn: async () => { failedCalls++; throw new ModelProviderError("Unavailable"); } },
    fallback: { mode: "llm", modelId: "backup", model: faux.getModel(), streamFn: models.streamSimple.bind(models) } } });
  try {
    const request = await serve(app); const state = createInterviewState("fallback", "role", createFixtureCandidate()); state.phaseVersion = 3; startInterview(state); app.store.create(state);
    const cmd = { commandId: "one", questionId: `fallback:${state.traces.length}`, expectedStateVersion: state.traces.length, answer: quote };
    const first = await request("/api/interviews/fallback/answer", "POST", cmd); assert.equal(first.status, 200); assert.equal(failedCalls, 2);
    assert.equal(first.body.state.turns.length, 1); assert.equal(first.body.state.evidence.length, 1);
    assert.equal(first.body.state.traces.at(-1).execution.evidence.modelId, "backup");
    assert.deepEqual(await request("/api/interviews/fallback/answer", "POST", cmd), first); assert.equal(failedCalls, 2);
  } finally { await app.close(); rmSync(root, { recursive: true, force: true }); }
});
