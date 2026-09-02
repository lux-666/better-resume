import assert from "node:assert/strict";
import test from "node:test";
import {
  activateInterview,
  applyInterviewDecision,
  createFixtureCandidate,
  createInterviewState,
  getInterviewProgress,
  recordAnswer,
  startInterview,
  submitAnswer,
  validateCompletion,
  type EvidenceProposal,
  type InterviewState,
} from "./index.ts";

function evidenceFor(
  state: InterviewState,
  sourceQuote: string,
  polarity: EvidenceProposal["polarity"] = "support",
): EvidenceProposal {
  const field = state.report.fields.find((item) => item.id === state.traces.at(-1)?.targetFieldId)!;
  const project = state.candidate.projects.find((item) => item.id === field.projectId)!;
  return {
    reportFieldIds: [field.id],
    claimIds: field.id.endsWith(":ownership") ? [project.claims[0].id]
      : field.id.endsWith(":measurement") ? [project.claims[1].id] : [],
    competencyId: field.competencyId,
    statement: `候选人说明了 ${field.name}。`,
    polarity,
    strength: 0.8,
    specificity: 0.9,
    evaluatorConfidence: 0.8,
    sourceQuote,
  };
}

test("Candidate Report is the interview workspace", () => {
  const state = createInterviewState("session", "role", createFixtureCandidate("Candidate"));
  assert.equal(state.report.fields.length, 8);
  assert.ok(state.report.fields.every((field) => field.status === "missing"));
  assert.ok(state.report.fields.some((field) => field.id.endsWith(":mechanism")));
  assert.equal("pendingLeads" in state.report, false);
});

test("the Agent chooses the investigation target instead of a core policy", () => {
  const state = createInterviewState("session", "role", createFixtureCandidate("Candidate"));
  activateInterview(state);
  const mechanism = state.report.fields.find((field) => field.id === "project_service_agent:mechanism")!;
  const step = applyInterviewDecision(state, {
    action: "ASK_CANDIDATE",
    targetFieldId: mechanism.id,
    reason: "The resume exposes a concrete architecture claim worth investigating first.",
    question: "客服 Agent 的状态转换和失败回退具体是怎么实现的？",
  });
  assert.equal(step.decision.targetFieldId, mechanism.id);
  assert.equal(state.currentQuestion, step.question);
});

test("a grounded report edit updates fields, claims, and competency evidence", () => {
  const state = createInterviewState("session", "role", createFixtureCandidate("Candidate"));
  startInterview(state);
  const answer = "我负责召回架构设计，并独立实现了切分、召回和 reranker 接入。";
  const record = recordAnswer(state, answer, [evidenceFor(state, answer)]);
  const field = state.report.fields.find((item) => item.id === record.evidence[0].reportFieldIds[0])!;
  assert.equal(field.status, "supported");
  assert.deepEqual(field.evidenceIds, [record.evidence[0].id]);
  assert.equal(state.candidate.projects[0].claims[0].status, "supported");
  assert.equal(state.competencies[0].competencyId, "software_engineering");
  assert.throws(() => recordAnswer(state, "当前没有待回答问题。"));
});

test("one answer may edit several report fields without Lead or Probe state", () => {
  const state = createInterviewState("session", "role", createFixtureCandidate("Candidate"));
  startInterview(state);
  const answer = "我负责召回，用 BM25 和 dense 各取 50 条后做 RRF，Recall@20 提升 8%。";
  const ownership = state.report.fields.find((field) => field.id === "project_enterprise_rag:ownership")!;
  const mechanism = state.report.fields.find((field) => field.id === "project_enterprise_rag:mechanism")!;
  const edits: EvidenceProposal[] = [ownership, mechanism].map((field) => ({
    reportFieldIds: [field.id],
    claimIds: field === ownership ? ["claim_rag_ownership"] : [],
    competencyId: field.competencyId,
    statement: `候选人说明了 ${field.name}。`,
    polarity: "support",
    strength: 0.8,
    specificity: 0.9,
    evaluatorConfidence: 0.8,
    sourceQuote: answer,
  }));
  recordAnswer(state, answer, edits);
  assert.equal(ownership.status, "supported");
  assert.equal(mechanism.status, "supported");
});

test("completion is Agent-requested but deterministically guarded", () => {
  const state = createInterviewState("session", "role", createFixtureCandidate("Candidate"));
  activateInterview(state);
  assert.equal(validateCompletion(state).allowed, false);
  assert.throws(() => applyInterviewDecision(state, {
    action: "FINISH_INTERVIEW",
    reason: "I think the report is done.",
  }), /incomplete/);

  applyInterviewDecision(state, {
    action: "ASK_CANDIDATE",
    targetFieldId: state.report.fields[0].id,
    reason: "Start evidence collection.",
    question: "你本人完成了什么？",
  });
  while (state.status === "active") {
    submitAnswer(state, "我给出了具体设计、实现、指标和故障验证细节。");
  }
  assert.equal(state.report.status, "complete");
  assert.equal(state.turns.length, 8);
});

test("contradictions block finish until grounded clarification resolves them", () => {
  const state = createInterviewState("session", "role", createFixtureCandidate("Candidate"));
  startInterview(state);
  const denial = "这个核心模块不是我做的。";
  const denied = recordAnswer(state, denial, [evidenceFor(state, "不是我做的", "invalidate")], "denial");
  assert.equal(state.report.contradictions[0].status, "open");
  assert.ok(validateCompletion(state).blockers.some((blocker) => blocker.includes("unresolved contradiction")));
  applyInterviewDecision(state, {
    action: "ASK_CANDIDATE",
    targetFieldId: denied.evidence[0].reportFieldIds[0],
    reason: "Clarify the contradiction.",
    question: "这项工作的准确分工是什么？",
  }, denied.turn.id);
  const clarification = "准确说法是我只负责召回接口联调。";
  recordAnswer(state, clarification, [evidenceFor(state, clarification, "weakness")]);
  assert.equal(state.report.contradictions[0].status, "resolved");
});

test("a repeated grounded denial clarifies a contradiction without reopening it", () => {
  const state = createInterviewState("session", "role", createFixtureCandidate("Candidate"));
  startInterview(state);
  const denial = "这个核心模块不是我做的。";
  const denied = recordAnswer(state, denial, [evidenceFor(state, denial, "invalidate")], "denial");
  for (const answer of ["准确说法是我只负责接口联调。", "我确实没有主导核心设计。"]) {
    applyInterviewDecision(state, {
      action: "ASK_CANDIDATE",
      targetFieldId: denied.evidence[0].reportFieldIds[0],
      reason: "Clarify the contradiction.",
      question: `请再次确认准确分工 ${state.turns.length}？`,
    });
    recordAnswer(state, answer, [evidenceFor(state, answer, "invalidate")], "denial");
    assert.equal(state.report.contradictions[0].status, "resolved");
  }
});

test("progress reports Candidate Report coverage separately from turn count", () => {
  const state = createInterviewState("session", "role", createFixtureCandidate("Candidate"));
  assert.deepEqual(getInterviewProgress(state, ["software_engineering", "evaluation"]), {
    stage: "not_started",
    coveragePercent: 0,
    turns: { completed: 0, max: 15 },
    projects: { covered: 0, total: 2 },
    reportFields: { covered: 0, total: 8 },
    coreCompetencies: { covered: 0, total: 2 },
    contradictionsOpen: 0,
  });
  startInterview(state);
  submitAnswer(state, "我负责检索架构设计，并独立实现了召回模块和 reranker 接入。");
  const progress = getInterviewProgress(state, ["software_engineering", "evaluation"]);
  assert.equal(progress.stage, "interviewing");
  assert.deepEqual(progress.projects, { covered: 1, total: 2 });
  assert.deepEqual(progress.reportFields, { covered: 1, total: 8 });
});
