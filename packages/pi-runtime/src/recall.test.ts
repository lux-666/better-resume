import assert from "node:assert/strict";
import test from "node:test";
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { activateInterview, applyInterviewDecision, buildCandidateFromIntake, buildInterviewRole, buildInterviewReportBundle, createInterviewState, groundedAnswerClaims, normalizeInterviewIntake, recordAnswer } from "../../interview-core/src/index.ts";
import { editReportWithAgent, TelemetryCollector } from "./index.ts";
import { recallTool, type SessionRecall } from "./recall.ts";
function runtime(calls: Array<[string, object]>) {
  const faux = fauxProvider(); const models = createModels(); models.setProvider(faux.provider);
  faux.setResponses(calls.map(([name, value]) => fauxAssistantMessage(fauxToolCall(name, value), { stopReason: "toolUse" })));
  return { model: faux.getModel(), streamFn: models.streamSimple.bind(models) };
}
function fixture() {
  const intake = normalizeInterviewIntake({ candidate: { name: "Test", skills: [], projects: ["A", "B", "C"].map((name) => ({ name, description: "参与系统设计" })) } });
  const role = buildInterviewRole({}); const state = createInterviewState("long", role, buildCandidateFromIntake(intake, role), intake); state.phaseVersion = 3; activateInterview(state);
  for (let n = 0; n < 13; n++) {
    const field = state.report.fields[n === 12 ? 4 : 0];
    applyInterviewDecision(state, { action: "ASK_CANDIDATE", targetFieldId: field.id, targetDepth: 3, question: `第${n}次实施时你如何选择？`, reason: "check" });
    const answer = n === 1 ? "第一个项目的缓存更新方案完全由我独立设计" : `我核对了第${n}次实验的记录`;
    recordAnswer(state, answer, [{ statement: answer, sourceQuote: answer, reportFieldIds: [field.id], claimIds: [], competencyId: field.competencyId, polarity: "support", strength: .9, specificity: .9, evaluatorConfidence: .9, depthLevel: 3 }]);
  }
  const field = state.report.fields[8]; applyInterviewDecision(state, { action: "ASK_CANDIDATE", targetFieldId: field.id, targetDepth: 3, question: "第一个项目的方案实际上由谁设计？", reason: "cross project" });
  return { state, field };
}
test("recall exposes older evidence beyond normal projection and enables a grounded cross-project contradiction", async () => {
  const { state, field } = fixture(); const early = state.evidence[1];
  const claim = groundedAnswerClaims(state, field.projectId).find((c) => c.sourceEvidenceId === early.id)!;
  assert.ok(!groundedAnswerClaims(state, field.projectId).slice(-10).some((c) => c.id === claim.id));
  const answer = "前面说完全独立设计不准确，第一个项目的方案是同事设计的";
  let queries = 0; const memory: SessionRecall = { recall: async () => { queries++; return [{ kind: "evidence", id: early.id, text: early.sourceQuote, projectId: early.projectId, score: 1 }]; } };
  const edit = await editReportWithAgent({ ...runtime([["read_report", {}], ["recall", { query: "缓存更新设计责任", scope: "evidence" }], ["edit_report", { answerDisposition: "contradiction", evidence: [{ reportFieldIds: [field.id], competencyId: field.competencyId, claimIds: [claim.id], statement: answer, sourceQuote: answer, polarity: "invalidate", strength: .9, specificity: .9, evaluatorConfidence: .9, depthLevel: 3 }] }]]), state, answer, memory });
  assert.equal(queries, 1); recordAnswer(state, answer, edit.evidence, edit.answerDisposition);
  assert.equal(state.turns.length, 14); assert.equal(state.report.contradictions.at(-1)?.kind, "cross_project"); assert.ok(buildInterviewReportBundle(state).report.integrity.valid);
});
test("resume recall yields unverified claims and rejects copying a resume-only quote into Evidence", async () => {
  const { state, field } = fixture(); const raw = "简历声称独立设计缓存"; const answer = "实际方案由同事设计，我负责测试";
  const memory: SessionRecall = { recall: async () => [{ kind: "resume", id: "resume:0", text: raw, score: 1 }] };
  const telemetry = new TelemetryCollector();
  const edit = await editReportWithAgent({ ...runtime([["read_report", {}], ["recall", { query: "缓存", scope: "resume" }],
    ["edit_report", { answerDisposition: "substantive", evidence: [{ reportFieldIds: [field.id], competencyId: field.competencyId, claimIds: [], statement: raw, sourceQuote: raw, polarity: "support", strength: 1, specificity: 1, evaluatorConfidence: 1, depthLevel: 3 }] }],
    ["edit_report", { answerDisposition: "substantive", evidence: [{ reportFieldIds: [field.id], competencyId: field.competencyId, claimIds: [], statement: answer, sourceQuote: answer, polarity: "support", strength: .9, specificity: .9, evaluatorConfidence: .9, depthLevel: 3 }] }]]), state, answer, memory, telemetry });
  assert.equal(edit.evidence[0].sourceQuote, answer); assert.deepEqual(edit.resumeClaims, []);
  assert.ok(telemetry.trace.spans.some((s) => s.outcome === "rejected")); assert.doesNotMatch(JSON.stringify(state.evidence), /简历声称/);
});
test("recall budget survives failures and requires report read", async () => {
  const { state } = fixture(); let calls = 0; let read = false;
  const tool = recallTool({ state, memory: { recall: async () => { calls++; throw new Error("offline"); } }, budget: { remaining: 2 }, canRead: () => read });
  const query = { query: "old answer", scope: "both" };
  await assert.rejects(tool.execute("one", query), /Read the report/); assert.equal(calls, 0); read = true;
  for (let i = 0; i < 3; i++) await tool.execute(String(i), query); assert.equal(calls, 2);
});
