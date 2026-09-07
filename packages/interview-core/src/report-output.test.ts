import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInterviewReportBundle,
  createFixtureCandidate,
  createInterviewState,
  recordAnswer,
  startInterview,
  renderInterviewReportMarkdown,
} from "./index.ts";

function stateWithEvidence() {
  const state = createInterviewState("report-session", "role", createFixtureCandidate("Candidate"));
  startInterview(state);
  const field = state.report.fields.find((item) => item.id === state.traces.at(-1)?.targetFieldId)!;
  const answer = "我负责核心流程设计，并完成了上线检查。";
  recordAnswer(state, answer, [{
    reportFieldIds: [field.id],
    claimIds: [],
    competencyId: field.competencyId,
    statement: "候选人说明了个人负责范围和交付。",
    polarity: "support",
    strength: 0.8,
    specificity: 0.8,
    evaluatorConfidence: 0.8,
    sourceQuote: answer,
  }]);
  return state;
}

test("candidate report links conclusions to questions, answer quotes, and evidence IDs", () => {
  const bundle = buildInterviewReportBundle(stateWithEvidence(), {
    generatedAt: "2026-09-02T00:00:00.000Z",
  });
  const supported = bundle.report.projects.flatMap((project) => project.fields)
    .find((field) => field.status === "supported")!;

  assert.equal(bundle.report.integrity.valid, true);
  assert.equal(supported.evidence.length, 1);
  assert.match(supported.evidence[0].question, /企业 RAG/);
  assert.equal(supported.evidence[0].answerQuote, "我负责核心流程设计，并完成了上线检查。");
  assert.equal(bundle.report.executiveSummary.recommendation, "continue_with_verification");
  assert.equal(bundle.report.executiveSummary.strengths[0].evidenceIds[0], supported.evidence[0].evidenceId);
  assert.match(bundle.markdown, /### 优势 · 企业 RAG 知识库/);
  assert.match(bundle.markdown, /## 原话索引/);
  assert.equal(bundle.markdown.split("候选人说明了个人负责范围和交付。").length, 2);
  assert.doesNotMatch(bundle.markdown, /#### .*missing|本次尚未获得足够/);
  assert.match(bundle.markdown, new RegExp(supported.evidence[0].evidenceId));
  assert.equal("scorecard" in bundle, false);
});

test("report integrity fails when an evidence quote cannot be traced to its answer", () => {
  const state = stateWithEvidence();
  state.turns[0].answer = "被篡改的回答";
  const bundle = buildInterviewReportBundle(state, {
    generatedAt: "2026-09-02T00:00:00.000Z",
  });

  assert.equal(bundle.report.integrity.valid, false);
  assert.ok(bundle.report.integrity.errors.some((error) => /source quote is not in the answer/.test(error)));
});

test("report gives actionable guidance for every unresolved field without treating missing as failure", () => {
  const state = createInterviewState("empty-report", "role", createFixtureCandidate("Candidate"));
  const bundle = buildInterviewReportBundle(state, {
    generatedAt: "2026-09-02T00:00:00.000Z",
  });

  assert.equal(bundle.report.executiveSummary.recommendation, "insufficient_evidence");
  assert.equal(bundle.report.executiveSummary.evidenceGaps.length, state.report.fields.length);
  assert.equal(bundle.report.executiveSummary.nextSteps.length, state.report.fields.length);
  assert.ok(bundle.report.executiveSummary.evidenceGaps.every((item) => /不能形成正面或负面能力结论/.test(item.reason)));
  assert.ok(bundle.report.executiveSummary.nextSteps.every((item) => /具体事实、个人动作和可验证结果/.test(item)));
  assert.ok(bundle.report.evaluationBasis.some((item) => /missing/.test(item)));
  assert.equal(bundle.report.integrity.valid, true);
});

test("a resolved contradiction requires verification without claiming clarification is still open", () => {
  const state = stateWithEvidence();
  state.report.fields[1].status = "contradicted";
  state.report.fields[1].evidenceIds = [...state.report.fields[0].evidenceIds];
  state.report.contradictions.push({
    id: "resolved",
    claimId: state.candidate.projects[0].claims[0].id,
    projectId: state.candidate.projects[0].id,
    status: "resolved",
    evidenceIds: [...state.report.fields[0].evidenceIds],
    resolutionEvidenceIds: [...state.report.fields[0].evidenceIds],
  });

  const report = buildInterviewReportBundle(state).report;
  assert.equal(report.executiveSummary.recommendation, "continue_with_verification");
  assert.doesNotMatch(report.executiveSummary.assessment, /需要澄清/);
  assert.match(report.executiveSummary.nextSteps.join("\n"), /复核.*更正结果/);
});

test("report renders dynamic findings once and keeps deduplicated source anchors", () => {
  const report = buildInterviewReportBundle(stateWithEvidence()).report;
  const source = report.projects[0].fields[0].evidence[0];
  report.narrative = { schemaVersion: "report-narrative-v0.1", overall: [{ text: "候选人说明了个人负责范围。", evidenceIds: [source.evidenceId] }],
    sections: [{ title: "上线检查的实际动作", paragraphs: [{ text: "候选人完成了上线检查。", evidenceIds: [source.evidenceId] }] }],
    projects: [], competencies: [], recruiterNextSteps: [], candidateFeedback: [], unexploredLeads: [] };
  report.projects[0].fields[1].evidence.push(source);
  const markdown = renderInterviewReportMarkdown(report);
  assert.equal(markdown.split("候选人完成了上线检查。").length, 2);
  assert.equal(markdown.split(`原话：“${source.answerQuote}”`).length, 2);
  assert.doesNotMatch(markdown, /尚未获得足够|分项目详细评估|证据强度指数/);
  assert.match(markdown, /调查范围与未覆盖内容/);
});
