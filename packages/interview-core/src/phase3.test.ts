import assert from "node:assert/strict";
import test from "node:test";
import { activateInterview, applyInterviewDecision, buildCandidateFromIntake, buildInterviewRole, buildInterviewReportBundle, createInterviewState,
  fieldConclusion, groundedAnswerClaims, normalizeInterviewIntake, projectLeads, recordAnswer, recordClarification, validateCompletion, type EvidenceProposal } from "./index.ts";
import { demoNarrative, validateNarrative } from "./narrative.ts";
function fixture() {
  const intake = normalizeInterviewIntake({ candidate: { name: "Test", skills: [], projects: [{ name: "A", description: "负责方案实施" }, { name: "B", description: "负责方案实施" }] } });
  const role = buildInterviewRole({}); const state = createInterviewState("test", role, buildCandidateFromIntake(intake, role), intake); state.phaseVersion = 3;
  activateInterview(state); return state;
}
function ask(state: ReturnType<typeof fixture>, fieldId = state.report.fields[0].id, extra = {}) {
  return applyInterviewDecision(state, { action: "ASK_CANDIDATE", targetFieldId: fieldId, targetDepth: 2, question: `第 ${state.traces.length + 1} 次交流，你采用的方法是什么？`, reason: "Explore", ...extra });
}
function proposal(state: ReturnType<typeof fixture>, text: string, depthLevel: 1 | 2 | 3 | 4 | 5 = 2): EvidenceProposal {
  const field = state.report.fields.find((field) => field.id === state.traces.at(-1)?.targetFieldId)!;
  return { reportFieldIds: [field.id], claimIds: [], competencyId: field.competencyId, statement: text, sourceQuote: text,
    polarity: "support", strength: .9, specificity: .9, evaluatorConfidence: .9, depthLevel };
}
test("depth and polarity aggregate from all evidence; leads derive follow/drop without a routing state", () => {
  const state = fixture(); ask(state);
  const fieldId = state.report.fields[0].id;
  const text = "我们使用 RRF 融合两路召回";
  recordAnswer(state, text, [proposal(state, text)], "substantive", [{ kind: "mechanism", text: "RRF", suggestedFieldId: fieldId }]);
  const lead = state.leads![0]; assert.equal("status" in lead, false);
  ask(state, fieldId, { followsLeadId: lead.id, targetDepth: 3 });
  recordAnswer(state, "记不清选择依据", [{ ...proposal(state, "记不清选择依据", 3), polarity: "weakness" }], "vague");
  assert.equal(projectLeads(state)[0].status, "followed");
  assert.equal(fieldConclusion(state, fieldId).reachedDepth, 2);
  assert.equal(fieldConclusion(state, fieldId).boundaryReason?.depthLevel, 3);
  assert.deepEqual(fieldConclusion(state, fieldId).supportStatements, [text]);
  assert.throws(() => ask(state, fieldId, { followsLeadId: lead.id }), /Lead/);
  const artifact = buildInterviewReportBundle(state).report;
  assert.match(artifact.projects[0].fields[0].conclusion, /RRF.*记不清/);
  assert.ok(artifact.integrity.valid);
});
test("invalid leads are rejected before any core facts are appended", () => {
  const state = fixture(); ask(state); const before = JSON.stringify(state);
  assert.throws(() => recordAnswer(state, "真实原话", [proposal(state, "真实原话")], "substantive", [{ kind: "metric", text: "不存在" }]));
  assert.equal(JSON.stringify(state), before);
});
test("cross-project contradiction references an accepted evidence source and keeps quotes in their own turns", () => {
  const state = fixture(); ask(state);
  const first = recordAnswer(state, "我独立完成方案", [proposal(state, "我独立完成方案", 3)]);
  const field = state.report.fields.find((f) => f.projectId === state.candidate.projects[1].id)!;
  ask(state, field.id);
  const claim = groundedAnswerClaims(state, field.projectId).find((c) => c.sourceEvidenceId === first.evidence[0].id)!;
  recordAnswer(state, "前一个项目并不是我独立完成的", [{ ...proposal(state, "前一个项目并不是我独立完成的"), polarity: "invalidate", claimIds: [claim.id] }], "contradiction");
  assert.equal(state.report.contradictions[0].kind, "cross_project");
  assert.equal(state.candidate.claims.at(-1)?.sourceEvidenceId, first.evidence[0].id);
  assert.ok(buildInterviewReportBundle(state).report.integrity.valid);
});
test("clarification preserves the question, raw request and turn limit; skip blocks reasking", () => {
  const state = fixture(); ask(state); const question = state.currentQuestion;
  recordClarification(state, "请解释含义", "可以说明你实际采用的一种方法，不确定的部分可以直接说明。");
  assert.equal(state.turns.length, 0); assert.equal(state.currentQuestion, question); assert.equal(state.clarifications?.[0].request, "请解释含义");
  assert.throws(() => recordClarification(state, "再解释", "请只说实际参与的部分。"), /one clarification/);
  const fieldId = state.traces.at(-1)!.targetFieldId!;
  recordAnswer(state, "我想跳过", [{ ...proposal(state, "我想跳过"), polarity: "weakness" }], "skip_request");
  assert.throws(() => ask(state, fieldId), /skipped/);
  assert.equal(validateCompletion(state).allowed, false);
});
test("narrative rejects invented numbers, out-of-scope citations, verdict promotion and unknown leads", () => {
  const state = fixture(); ask(state); recordAnswer(state, "我使用固定的样本对照", [proposal(state, "我使用固定的样本对照", 3)]);
  const artifact = buildInterviewReportBundle(state).report;
  const valid = demoNarrative(artifact); assert.ok(validateNarrative(valid, artifact));
  const number = structuredClone(valid); number.overall[0].text = "效果提高 9988%"; assert.throws(() => validateNarrative(number, artifact), /number/);
  const scope = structuredClone(valid); scope.projects[1].summary = valid.overall; assert.throws(() => validateNarrative(scope, artifact), /scope/);
  const verdict = structuredClone(valid); verdict.competencies[1].verdict = "demonstrated"; assert.throws(() => validateNarrative(verdict, artifact), /verdict/);
  const lead = structuredClone(valid); lead.unexploredLeads = ["invented"]; assert.throws(() => validateNarrative(lead, artifact), /leads/);
});
