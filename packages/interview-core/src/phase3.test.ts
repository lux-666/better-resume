import assert from "node:assert/strict";
import test from "node:test";
import { activateInterview, applyInterviewDecision, buildCandidateFromIntake, buildInterviewRole, buildInterviewReportBundle, createInterviewState,
  fieldConclusion, groundedAnswerClaims, normalizeInterviewIntake, projectLeads, recordAnswer, recordClarification, validateCompletion, type EvidenceProposal } from "./index.ts";
import { demoNarrative, validateNarrative } from "./narrative.ts";
import { getDemoInterviewDecision, submitAnswer } from "./index.ts";
import { projectPauseReason } from "./investigation.ts";
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
  for (const remaining of state.report.fields.filter((item) => item.projectId === first.turn.projectId && item.status === "missing")) {
    ask(state, remaining.id); const answer = `我核验了${remaining.name}的实施记录`;
    recordAnswer(state, answer, [proposal(state, answer, 3)]);
  }
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

test("project switching requires outcomes and depth, while skipped topics allow transition and elapsed time does not end it", () => {
  const state = fixture(); ask(state);
  recordAnswer(state, "我负责实施", [proposal(state, "我负责实施", 2)]);
  const next = state.report.fields[4].id;
  const before = JSON.stringify(state);
  assert.throws(() => ask(state, next), /Continue the current project.*measurement/);
  assert.equal(JSON.stringify(state), before);
  for (const field of state.report.fields.slice(1, 4)) {
    ask(state, field.id); const answer = `我检查了${field.name}的记录`;
    recordAnswer(state, answer, [proposal(state, answer, 2)]);
  }
  assert.throws(() => ask(state, next), /rationale/);
  ask(state, state.report.fields[1].id, { targetDepth: 3 });
  recordAnswer(state, "选择固定样本是为了排除输入差异", [proposal(state, "选择固定样本是为了排除输入差异", 3)]);
  assert.doesNotThrow(() => ask(state, next));

  const skipped = fixture();
  for (const field of skipped.report.fields.slice(0, 2)) {
    ask(skipped, field.id); recordAnswer(skipped, "我想跳过", [], "skip_request");
  }
  assert.doesNotThrow(() => ask(skipped, skipped.report.fields[4].id));

  const timed = fixture(); ask(timed); recordAnswer(timed, "我负责实施", [proposal(timed, "我负责实施")]);
  timed.timeBudgetMinutes = 1; timed.startedAt = new Date(Date.now() - 61_000).toISOString();
  assert.throws(() => ask(timed, timed.report.fields[4].id), /Continue the current project/);
  assert.equal(timed.status, "active");
  assert.doesNotMatch(buildInterviewReportBundle(timed).markdown, /达到约定时长后结束/);
});

test("explicit project boundaries immediately switch without filling missing fields or erasing contradictions", () => {
  for (const answer of ["我不清楚，换个项目吧", "这个项目我都记不清了", "我们换项目吧"]) {
    const state = fixture(); ask(state);
    const project = state.candidate.projects[0];
    recordAnswer(state, answer, [], "vague");
    assert.ok(projectPauseReason(state, project.id));
    state.report.contradictions.push({ id: "unresolved", claimId: "claim", projectId: project.id, status: "open", evidenceIds: [], resolutionEvidenceIds: [] });
    const decision = getDemoInterviewDecision(state);
    assert.equal(state.report.fields.find((f) => f.id === decision.targetFieldId)?.projectId, state.candidate.projects[1].id);
    assert.doesNotThrow(() => applyInterviewDecision(state, decision));
    assert.throws(() => ask(state, state.report.fields[1].id), /boundary/);
    assert.equal(state.report.contradictions[0].status, "open");
    assert.match(buildInterviewReportBundle(state).report.limitations.join("\n"), /未展开内容保留为待核实/);
  }
});

test("two uncertain answers across different fields pause a project, and all paused projects open the floor early", () => {
  const state = fixture(); ask(state);
  recordAnswer(state, "我不清楚", [], "vague");
  assert.equal(projectPauseReason(state, state.candidate.projects[0].id), undefined);
  ask(state, state.report.fields[1].id);
  recordAnswer(state, "记不清了", [], "vague");
  assert.ok(projectPauseReason(state, state.candidate.projects[0].id));
  applyInterviewDecision(state, getDemoInterviewDecision(state));
  submitAnswer(state, "这个项目我都记不清了", [], "vague");
  assert.equal(state.openFloor, true);
  assert.equal(state.turns.length, 3);
  assert.ok(state.report.fields.some((f) => f.status === "missing"));
  assert.equal(validateCompletion(state).allowed, true);
  submitAnswer(state, "没有了");
  assert.equal(state.status, "completed");
});

test("a concrete answer after uncertainty keeps a productive project open; a denied switch is not a request", () => {
  const state = fixture(); ask(state);
  recordAnswer(state, "我记不清了", [], "vague");
  ask(state, state.report.fields[1].id);
  const answer = "不用换项目，我用固定样本排除输入差异，比较了两个方案";
  recordAnswer(state, answer, [proposal(state, answer, 3)]);
  assert.equal(projectPauseReason(state, state.candidate.projects[0].id), undefined);
  assert.throws(() => ask(state, state.report.fields[4].id), /Continue the current project/);
});

test("dynamic report sections preserve citations without requiring empty project or competency paragraphs", () => {
  const state = fixture(); ask(state); recordAnswer(state, "用固定样本排除输入差异", [proposal(state, "用固定样本排除输入差异", 3)]);
  const report = buildInterviewReportBundle(state).report;
  const narrative = demoNarrative(report);
  narrative.projects = []; narrative.competencies = [];
  narrative.sections = [{ title: "验证方法的选择依据", paragraphs: [{ text: "候选人使用固定样本控制输入差异。", evidenceIds: [state.evidence[0].id] }] }];
  assert.ok(validateNarrative(narrative, report));
  const repeated = structuredClone(narrative); repeated.sections![0].paragraphs = repeated.overall;
  assert.throws(() => validateNarrative(repeated, report), /repeats/);
  const invented = structuredClone(narrative); invented.sections![0].paragraphs[0].evidenceIds = ["unknown"];
  assert.throws(() => validateNarrative(invented, report), /citation/);
});

test("development plans require grounded reasons and weak evidence cannot be promoted to a strength", () => {
  const state = fixture(); ask(state);
  recordAnswer(state, "记不清验证方法", [{ ...proposal(state, "记不清验证方法", 2), polarity: "weakness" }], "vague");
  const report = buildInterviewReportBundle(state).report;
  const narrative = demoNarrative(report);
  assert.ok(narrative.improvementPlan?.[0].action);
  assert.ok(narrative.improvementPlan?.[0].acceptance);
  assert.ok(validateNarrative(narrative, report));
  const promoted = structuredClone(narrative); promoted.insights![0].kind = "strength";
  assert.throws(() => validateNarrative(promoted, report), /Strength/);
  const ungrounded = structuredClone(narrative); ungrounded.improvementPlan![0].rationale.evidenceIds = [];
  assert.throws(() => validateNarrative(ungrounded, report), /citation/);
});
