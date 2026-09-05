import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { once } from "node:events";
import { Check } from "typebox/value";
import { InterviewReportResponseSchema, InterviewStepResponseSchema, type InterviewStateResponse } from "../../../packages/api-contract/src/index.ts";
import { summarizeTelemetry } from "../../../packages/api-contract/src/telemetry-summary.ts";
import { activateInterview, applyInterviewDecision, buildCandidateFromIntake, buildInterviewRole, createInterviewState, normalizeInterviewIntake, type DepthLevel } from "../../../packages/interview-core/src/index.ts";
import { editReportWithAgent, TelemetryCollector, withOneProviderRetry } from "../../../packages/pi-runtime/src/index.ts";
import { createApplication } from "./application.ts";
import { configuredRuntimes } from "./configured-runtimes.ts";
import { demoProfiles, type DemoProfile } from "./demo-profiles.ts";
const root = resolve(import.meta.dirname, "../../..");
const args = process.argv.slice(2);
const demo = args.includes("--demo");
const runtimes = demo ? { report: { mode: "demo" as const }, interview: { mode: "demo" as const }, info: { mode: "demo" as const } } : configuredRuntimes();
if (!demo && runtimes.info.mode !== "llm") throw new Error("Real Phase 3 evaluation requires a configured LLM; use --demo explicitly for a local smoke run");
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const output = resolve(process.env.PHASE3_OUTPUT_DIR ?? `data/evaluations/phase3-${runId}`);
mkdirSync(output, { recursive: true });
const app = createApplication({ databasePath: resolve(output, "sessions.db"), runtimes, deadlineMs: 90_000 });
app.server.listen(0, "127.0.0.1"); await once(app.server, "listening");
const address = app.server.address(); if (!address || typeof address === "string") throw new Error("Missing listen address");
const base = `http://127.0.0.1:${address.port}`;
const results: Array<Record<string, unknown>> = [];
async function request(path: string, body?: object) {
  const response = await fetch(base + path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const value = await response.json();
  if (!response.ok) throw new Error(`HTTP ${response.status} ${value.code}`);
  return value;
}
async function runProfile(profile: DemoProfile, special?: "question_back" | "skip_request") {
  const snapshots: InterviewStateResponse[] = [];
  let id: string | undefined;
  try {
    let current: InterviewStateResponse = await request("/api/interviews", profile.intake); id = current.state.sessionId;
    current = await request(`/api/interviews/${id}/start`, {}); snapshots.push(current);
    const clarifications = special === "question_back";
    if (clarifications) {
      current = await request(`/api/interviews/${id}/answer`, { commandId: crypto.randomUUID(), questionId: current.questionId,
        expectedStateVersion: current.stateVersion, answer: "请解释这个问题的含义。", intent: "clarify" });
      if (current.state.turns.length !== 0 || current.state.clarifications?.length !== 1) throw new Error("Clarification contract failed");
      snapshots.push(current);
    }
    for (let index = 0; current.state.status === "active" && index < 15; index++) {
      const trace = current.state.traces.at(-1)!;
      const kind = trace.targetFieldId?.split(":").at(-1) ?? "ownership";
      const field = current.state.report.fields.find((item) => item.id === trace.targetFieldId);
      const contradictory = current.state.report.contradictions.some((item) => item.projectId === field?.projectId && item.status === "open");
      const answer = special === "skip_request" && index === 0 ? "我想跳过这个问题。"
        : contradictory ? profile.script.clarification ?? profile.script.ownership
        : profile.profile === "boundary" && (trace.targetDepth ?? 1) >= 3 ? profile.script.boundary
        : profile.script[kind] ?? profile.script.ownership;
      const next = await request(`/api/interviews/${id}/answer`, { commandId: crypto.randomUUID(), questionId: current.questionId,
        expectedStateVersion: current.stateVersion, answer, ...(special === "skip_request" && index === 0 ? { intent: "skip" } : {}) });
      if (!Check(InterviewStepResponseSchema, next)) throw new Error("Step contract failed");
      current = next; snapshots.push(current);
      console.log(JSON.stringify({ type: "phase3_turn", profile: special ?? profile.id, turn: current.state.turns.length, status: current.state.status }));
    }
    let report = await request(`/api/interviews/${id}/report`);
    for (let index = 0; report.report.narrativeStatus === "pending" && index < 190; index++) {
      await new Promise((resolve) => setTimeout(resolve, 1_000)); report = await request(`/api/interviews/${id}/report`);
    }
    const traces = app.hub.traces(id);
    const normalized = current.state.turns.map((turn) => turn.question.replace(/[\s\p{P}\p{S}]/gu, ""));
    const conditions = {
      completed: current.state.status === "completed", turnLimit: current.state.turns.length <= 15,
      grounded: current.state.evidence.every((evidence) => current.state.turns.some((turn) => turn.id === evidence.turnId && turn.answer.includes(evidence.sourceQuote))),
      reportIntegrity: report.report.integrity.valid, reportContract: Check(InterviewReportResponseSchema, report),
      narrativeReady: report.report.narrativeStatus === "ready", uniqueQuestions: new Set(normalized).size === normalized.length,
      traceTerminal: traces.every((trace) => trace.status !== "running"),
      ...(profile.profile === "boundary" && !special ? { boundaryObserved: report.report.projects.some((p: any) => p.fields.some((f: any) => f.detail.boundaryReason?.depthLevel === 3)) } : {}),
      ...(special === "skip_request" ? { skipped: current.state.turns[0]?.disposition === "skip_request" } : {}),
    };
    const passed = Object.values(conditions).every(Boolean);
    const artifact = { id: special ?? profile.id, recordedAt: new Date().toISOString(), mode: runtimes.info.mode, snapshots, report, traces, conditions,
      summary: summarizeTelemetry(traces), passed, manualRubric: "not_run" };
    writeFileSync(resolve(output, `${special ?? profile.id}.json`), JSON.stringify(artifact, null, 2));
    if (passed && !special) { const directory = resolve(root, "data/demo-profiles/replays"); mkdirSync(directory, { recursive: true }); writeFileSync(resolve(directory, `${profile.id}.json`), JSON.stringify(artifact)); }
    results.push({ profile: special ?? profile.id, passed, conditions, summary: artifact.summary });
    console.log(JSON.stringify({ type: "phase3_profile", profile: special ?? profile.id, passed, conditions }));
  } catch (error) {
    const failure = { profile: special ?? profile.id, passed: false, error: error instanceof Error ? error.message : "Evaluation failed", snapshots,
      traces: id ? app.hub.traces(id) : [] };
    writeFileSync(resolve(output, `${special ?? profile.id}.json`), JSON.stringify(failure, null, 2));
    results.push({ profile: special ?? profile.id, passed: false, error: failure.error });
    console.log(JSON.stringify({ type: "phase3_profile", profile: special ?? profile.id, passed: false, error: failure.error }));
  }
}
async function runDepth() {
  if (runtimes.report.mode !== "llm" || !runtimes.report.model || !runtimes.report.streamFn) return;
  const cases = JSON.parse(readFileSync(resolve(root, "data/evaluation-corpus/phase3-depth.json"), "utf8")) as
    Array<{ id: string; expectedDepthLevel: DepthLevel; fieldKind: string; answer: string; expectedDisposition: string }>;
  const comparisons: Array<Record<string, unknown>> = [];
  for (const item of cases) {
    const intake = normalizeInterviewIntake(demoProfiles()[1].intake); const role = buildInterviewRole({ job: intake.job });
    const state = createInterviewState(`depth-${item.id}`, role, buildCandidateFromIntake(intake, role), intake); state.phaseVersion = 3; activateInterview(state);
    const field = state.report.fields.find((field) => field.id.endsWith(`:${item.fieldKind}`))!;
    applyInterviewDecision(state, { action: "ASK_CANDIDATE", targetFieldId: field.id, targetDepth: item.expectedDepthLevel,
      reason: "Frozen depth replay", question: "关于这项工作，你想说明的具体内容是什么？" });
    const telemetry = new TelemetryCollector({ sessionId: state.sessionId, operation: "depth_replay" });
    const signal = AbortSignal.timeout(90_000); let attempt = 1;
    try {
      const edit = await withOneProviderRetry(() => editReportWithAgent({ model: runtimes.report.model!, streamFn: runtimes.report.streamFn!, state,
        answer: item.answer, telemetry, signal, attempt }), () => { attempt += 1; });
      const relevant = edit.evidence.filter((evidence) => evidence.reportFieldIds.includes(field.id));
      const matched = relevant.length > 0 && relevant.every((evidence) => evidence.depthLevel === item.expectedDepthLevel);
      telemetry.end("succeeded"); comparisons.push({ ...item, matched, edit, telemetry: telemetry.trace });
      console.log(JSON.stringify({ type: "phase3_depth", id: item.id, matched }));
    } catch { telemetry.end(signal.aborted ? "timed_out" : "failed"); comparisons.push({ ...item, matched: false, error: "Report replay failed", telemetry: telemetry.trace }); }
  }
  const accuracy = comparisons.filter((item) => item.matched).length / comparisons.length;
  writeFileSync(resolve(output, "depth.json"), JSON.stringify({ accuracy, cases: comparisons }, null, 2));
  results.push({ profile: "depth", accuracy, passed: accuracy >= .8 });
}
try {
  const selected = args.includes("--profile") ? args[args.indexOf("--profile") + 1] : undefined;
  if (args.includes("--depth") || (!demo && !selected)) await runDepth();
  if (!args.includes("--depth")) {
    for (const profile of demoProfiles().filter((item) => !selected || item.id === selected)) await runProfile(profile);
    if (!selected || selected === "question_back") await runProfile(demoProfiles()[0], "question_back");
    if (!selected || selected === "skip_request") await runProfile(demoProfiles()[1], "skip_request");
  }
  writeFileSync(resolve(output, "summary.json"), JSON.stringify({ mode: runtimes.info, results, manualRubric: "not_run" }, null, 2));
  console.log(JSON.stringify({ type: "phase3_result", output, mode: runtimes.info.mode, results, manualRubric: "not_run" }));
  if (!results.length || results.some((result) => !result.passed)) process.exitCode = 1;
} finally { await app.close(); }
