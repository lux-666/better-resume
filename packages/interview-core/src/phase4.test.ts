import assert from "node:assert/strict";
import test from "node:test";
import { activateInterview, applyInterviewDecision, buildCandidateFromIntake, buildInterviewRole, buildInterviewReportBundle, createInterviewState, normalizeInterviewIntake, recordAnswer, validateCompletion, type EvidenceProposal } from "./index.ts";
import { buildSummary } from "./memory.ts";
import { applyRolePack, jdLines, requirementMatrix, validateRolePack } from "./role-pack.ts";
import type { RolePack } from "./phase4-schema.ts";
import { demoNarrative, validateNarrative } from "./narrative.ts";
function fixture() {
  const intake = normalizeInterviewIntake({ candidate: { name: "Test", skills: [], projects: ["A", "B", "C"].map((name) => ({ name, description: "负责系统设计与实施" })) },
    job: { title: "后端开发", introduction: "业务平台", responsibilities: "实现服务", requirements: "必须说明技术机制\n具备结果验证经验" } });
  const role = buildInterviewRole({ job: intake.job }); const state = createInterviewState("phase4", role, buildCandidateFromIntake(intake, role), intake); state.phaseVersion = 3; return state;
}
function plan(state: ReturnType<typeof fixture>): RolePack {
  const fields = state.report.fields.slice(0, 4);
  return { version: "role-pack-v0.1", competencies: state.role.competencies,
    requirements: jdLines(state).map((text, n) => ({ id: `r${n}`, text, priority: n ? "should" : "must", competencyId: fields[n].competencyId, verifiableSignals: ["说明个人实施细节"] })),
    fieldPlan: fields.map((f, n) => ({ fieldKind: f.id.split(":").at(-1)!, competencyId: f.competencyId, name: f.name, importance: .5, appliesToProjects: "all", requirementIds: n < 2 ? [`r${n}`] : [] })), projectRelevance: {} };
}
function answer(state: ReturnType<typeof fixture>, fieldId: string, text: string, depthLevel: 2 | 3 = 3, polarity: EvidenceProposal["polarity"] = "support") {
  const field = state.report.fields.find((f) => f.id === fieldId)!;
  applyInterviewDecision(state, { action: "ASK_CANDIDATE", targetFieldId: field.id, targetDepth: depthLevel, question: `第${state.traces.length + 1}个具体实施细节是什么？`, reason: "调查细节" });
  recordAnswer(state, text, [{ sourceQuote: text, statement: text, reportFieldIds: [field.id], competencyId: field.competencyId, claimIds: [], depthLevel, polarity, strength: .9, specificity: .9, evaluatorConfidence: .9 }]);
}
test("Role Pack keeps exact complete JD lines, IDs, field bounds and must blockers", () => {
  const state = fixture(); const pack = plan(state); assert.deepEqual(validateRolePack(pack, state), pack);
  for (const change of [
    (p: RolePack) => { p.requirements[0].text = "编造条件"; },
    (p: RolePack) => { p.requirements.pop(); },
    (p: RolePack) => { p.requirements[1].id = p.requirements[0].id; },
    (p: RolePack) => { p.competencies[0].weight = 1; },
    (p: RolePack) => { p.fieldPlan[0].requirementIds = ["unknown"]; },
    (p: RolePack) => { p.projectRelevance.unknown = ["r0"]; },
    (p: RolePack) => { p.fieldPlan[0].appliesToProjects = "relevant"; },
  ]) { const bad = structuredClone(pack); change(bad); assert.throws(() => validateRolePack(bad, state)); }
  applyRolePack(state, pack); assert.equal(state.report.fields.length, 12);
  assert.equal(state.report.fields[0].importance, 1); activateInterview(state);
  assert.ok(validateCompletion(state).blockers.some((b) => b.includes(state.report.fields[0].id)));
  assert.throws(() => applyRolePack(state, pack), /frozen/);
});
test("matrix distinguishes shallow support and conflicts and narrative covers every must with scoped evidence", () => {
  const state = fixture(); applyRolePack(state, plan(state)); activateInterview(state);
  assert.equal(requirementMatrix(state)[0].status, "not_investigated");
  answer(state, state.report.fields[0].id, "我对参数做过独立验证", 2); assert.equal(requirementMatrix(state)[0].status, "partial");
  answer(state, state.report.fields[0].id, "我用固定样本做过对照", 3); assert.equal(requirementMatrix(state)[0].status, "supported");
  answer(state, state.report.fields[4].id, "另一个项目我没有做过实际验证", 3, "invalidate");
  assert.equal(requirementMatrix(state)[0].status, "contradicted");
  const bundle = buildInterviewReportBundle(state); assert.equal(bundle.report.executiveSummary.recommendation, "hold_for_clarification");
  assert.match(bundle.markdown, /岗位要求匹配/); assert.ok(bundle.report.integrity.valid);
  const narrative = demoNarrative(bundle.report); assert.equal(narrative.requirements?.length, 1);
  const missing = structuredClone(narrative); missing.requirements = []; assert.throws(() => validateNarrative(missing, bundle.report), /coverage/);
  const promoted = structuredClone(narrative); promoted.requirements![0].status = "supported"; assert.throws(() => validateNarrative(promoted, bundle.report), /conflicts/);
});
test("14-turn source-derived summary stays within 1500 chars and retains grounded project references", () => {
  const state = fixture(); activateInterview(state);
  for (let n = 0; n < 14; n++) answer(state, state.report.fields[n % 12].id, `在这次实施中我记录了不同条件的结果，样本标识为第${n}组。`);
  const summary = buildSummary(state); assert.equal(summary.version, 14); assert.ok(JSON.stringify(summary).length <= 1500);
  assert.equal(summary.perProject.length, 3);
  for (const part of summary.perProject) for (const line of part.keyStatements) {
    const evidence = state.evidence.find((e) => e.id === line.evidenceId)!; assert.equal(evidence.projectId, part.projectId);
    assert.ok(state.turns.find((t) => t.id === evidence.turnId)!.answer.includes(line.text));
  }
  const legacySnapshot = { ...state, memory: { summary: { ...summary, version: 999 } } };
  assert.deepEqual(buildSummary(legacySnapshot), summary);
  state.timeBudgetMinutes = 20; state.startedAt = new Date(Date.now() - 21 * 60_000).toISOString();
  assert.equal(validateCompletion(state).forced, false);
});
