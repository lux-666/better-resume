import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { configuredRuntimes } from "./configured-runtimes.ts";
import { configuredEmbedding } from "./embedding.ts";
import { InterviewStore } from "./store.ts";
import { SessionMemory } from "./session-memory.ts";
import { runModelStage } from "./model-stage.ts";
import { generateRolePack } from "../../../packages/pi-runtime/src/role-pack.ts";
import { editReportWithAgent, TelemetryCollector } from "../../../packages/pi-runtime/src/index.ts";
import { activateInterview, applyInterviewDecision, buildCandidateFromIntake, buildInterviewRole, buildInterviewReportBundle, createInterviewState, recordAnswer } from "../../../packages/interview-core/src/index.ts";
import { applyRolePack } from "../../../packages/interview-core/src/role-pack.ts";
const runtimes = configuredRuntimes();
if (runtimes.report.mode !== "llm") throw new Error("Configure Report model before the Phase 4 smoke test");
const embedding = configuredEmbedding(); if (!embedding) throw new Error("Configure embedding before the Phase 4 smoke test");
const output = resolve("data/evaluations/phase4-smoke.json");
const results: Record<string, unknown> = { createdAt: new Date().toISOString(), model: runtimes.report.modelId,
  limitation: "One synthetic JD and one frozen 14-turn case; no human scoring, baseline quality or latency Gate claims." };
const store = new InterviewStore(":memory:");
try {
  const intake = { candidate: { name: "合成冒烟", skills: ["Redis", "TypeScript"], projects: ["订单服务", "库存服务", "通知服务"].map((name) => ({ name, description: "实现缓存更新和数据库写入，参与接口测试和线上排障。" })) },
    job: { title: "后端工程师", introduction: "开发交易服务", responsibilities: "实现可靠的业务接口与运行监控", requirements: "必须能解释缓存与数据库的一致性处理。\n能够用数据验证上线效果。\n具备消息队列经验优先。" } };
  const role = buildInterviewRole({ job: intake.job });
  const state = createInterviewState("phase4-smoke", role, buildCandidateFromIntake(intake, role), intake); state.phaseVersion = 3;
  const planTrace = new TelemetryCollector({ operation: "role_pack_smoke" });
  try {
    const result = await runModelStage({ primary: runtimes.report, fallback: runtimes.fallback, telemetry: planTrace, signal: AbortSignal.timeout(90_000),
      invoke: (runtime, attempt, signal) => generateRolePack({ model: runtime.model!, streamFn: runtime.streamFn!, state, telemetry: planTrace, attempt, signal }) });
    applyRolePack(state, result.value); planTrace.end("succeeded");
    results.rolePack = { accepted: true, requirements: state.rolePack?.requirements.length, fields: state.report.fields.length, pack: state.rolePack, trace: planTrace.trace };
    console.log(JSON.stringify({ stage: "role_pack", accepted: true, requirements: state.rolePack?.requirements.length, fields: state.report.fields.length }));
  } catch { planTrace.end("failed"); results.rolePack = { accepted: false, trace: planTrace.trace }; console.log(JSON.stringify({ stage: "role_pack", accepted: false })); }
  activateInterview(state);
  for (let n = 0; n < 13; n++) {
    const project = state.candidate.projects[n < 7 ? 0 : 1]; const field = state.report.fields.find((f) => f.projectId === project.id && f.id.endsWith(":ownership"))!;
    applyInterviewDecision(state, { action: "ASK_CANDIDATE", targetFieldId: field.id, targetDepth: 3, question: `第${n + 1}次方案验证中你具体做了什么？`, reason: "Synthetic fixture" });
    const answer = n === 1 ? "订单服务的缓存更新方案完全由我独立设计，其他人没有参与设计。" : `在第${n + 1}次验收中，我核对了接口与测试记录，实际负责测试执行。`;
    recordAnswer(state, answer, [{ statement: answer, sourceQuote: answer, reportFieldIds: [field.id], claimIds: [], competencyId: field.competencyId, polarity: "support", strength: .9, specificity: .9, evaluatorConfidence: .9, depthLevel: 3 }]);
  }
  const current = state.report.fields.find((f) => f.projectId === state.candidate.projects[2].id && f.id.endsWith(":ownership"))!;
  applyInterviewDecision(state, { action: "ASK_CANDIDATE", targetFieldId: current.id, targetDepth: 3, question: "你如何划分自己和同事在缓存方案中的职责？", reason: "Check consistency" });
  store.create(state); const memory = new SessionMemory(store.database, embedding);
  const trace = new TelemetryCollector({ sessionId: state.sessionId, operation: "long_horizon_smoke" });
  const before = JSON.stringify(state); const answer = "我纠正一下很早在订单服务里说的缓存方案完全独立设计：实际是同事做方案，我只负责测试，通知服务也是同样分工。";
  try {
    const edit = await editReportWithAgent({ model: runtimes.report.model!, streamFn: runtimes.report.streamFn!, state, answer, memory, telemetry: trace, signal: AbortSignal.timeout(90_000) });
    if (JSON.stringify(state) !== before) throw new Error("Agent mutated frozen State");
    recordAnswer(state, answer, edit.evidence, edit.answerDisposition, edit.leads);
    const report = buildInterviewReportBundle(state).report; trace.end("succeeded");
    results.memory = { accepted: true, turns: state.turns.length, recalls: trace.trace.spans.filter((s) => s.kind === "recall").length,
      crossProject: state.report.contradictions.some((c) => c.kind === "cross_project"), integrity: report.integrity, trace: trace.trace };
    console.log(JSON.stringify({ stage: "memory", ...Object.fromEntries(Object.entries(results.memory as object).filter(([key]) => key !== "trace")) }));
  } catch { trace.end("failed"); results.memory = { accepted: false, trace: trace.trace }; console.log(JSON.stringify({ stage: "memory", accepted: false })); }
} finally {
  store.close(); mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(results, null, 2)); console.log(`Saved ${output}`);
}
const memoryResult = results.memory as { accepted: boolean; crossProject?: boolean; integrity?: { valid: boolean } };
if (!(results.rolePack as { accepted: boolean })?.accepted || !memoryResult?.accepted || !memoryResult.crossProject || !memoryResult.integrity?.valid) process.exitCode = 1;
