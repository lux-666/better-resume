import assert from "node:assert/strict";
import test from "node:test";
import {
  createFixtureCandidate, createInterviewState, getInterviewProgress, getNextInterviewAction, selectAnchorProject,
  startInterview, submitAnswer,
  type CandidateProfile, type Project,
} from "./index.ts";

const project = (id: string, relevance: number): Project => ({
  id, name: id, description: "", technologies: ["TypeScript"], outcomes: [], claims: [],
  mappedCompetencies: ["software_engineering"], topics: [], status: "unexplored", roleRelevance: relevance,
});

test("fixture interview turns an answer into evidence and the next policy question", () => {
  const state = createInterviewState(
    "session",
    "llm_application_engineer",
    createFixtureCandidate("Candidate"),
  );
  const started = startInterview(state);
  assert.match(started.question ?? "", /本人具体负责/);

  const ownership = submitAnswer(
    state,
    "我负责检索架构设计，并独立实现了切分、召回和 reranker 接入。",
  );
  assert.equal(ownership.evidence[0].sourceQuote, "我负责检索架构设计，并独立实现了切分、召回和 reranker 接入。");
  assert.deepEqual(ownership.evidence[0].claimIds, ["claim_rag_ownership"]);
  assert.equal(state.candidate.projects[0].claims[0].status, "supported");
  assert.equal(state.competencies[0].competencyId, "software_engineering");
  assert.equal(ownership.decision.action, "SWITCH_TOPIC");
  assert.equal(ownership.decision.skill, "metric-audit");
  assert.equal(ownership.decision.targetGap, "metric_definition");
  assert.match(ownership.question ?? "", /指标如何定义/);
  assert.equal(state.traces.at(-1)?.turnId, state.turns[0].id);
  assert.equal(state.traces.at(-1)?.selectedSkill, "metric-audit");

  const metric = submitAnswer(
    state,
    "准确率按人工标注测试集上的正确回答比例计算，基线为未加 reranker 的版本。",
  );
  assert.equal(metric.decision.action, "SWITCH_TOPIC");
  assert.equal(metric.decision.skill, "failure-forensics");
  assert.equal(metric.decision.targetGap, "failure_analysis");
  assert.equal(state.status, "active");
  assert.equal(state.evidence.length, 2);
});

test("policy starts from the strongest project and routes open gaps to a skill", () => {
  const weak = project("weak", 0.2);
  const strong = project("strong", 0.9);
  assert.equal(selectAnchorProject([weak, strong])?.id, "strong");
  strong.status = "active";
  strong.topics = [{
    id: "evaluation", projectId: strong.id, name: "Evaluation", status: "active", summary: "",
    evidenceIds: [], pendingLeads: [], relatedCompetencies: ["evaluation"], turnIds: [],
    saturation: 0.1, expectedInformationGain: 0.9,
    unresolvedGaps: [{
      competencyId: "evaluation", type: "metric_definition",
      description: "The claimed improvement has no metric definition.", importance: 0.9, status: "open",
    }],
  }];
  const candidate: CandidateProfile = {
    id: "candidate", name: "Candidate", education: [], experiences: [],
    projects: [strong], skills: [], claims: [],
  };
  const decision = getNextInterviewAction(createInterviewState("session", "llm_application_engineer", candidate));
  assert.equal(decision.action, "CONTINUE_TOPIC");
  assert.equal(decision.skill, "metric-audit");
});

test("answer transition consumes supplied evidence instead of demo extraction", () => {
  const state = createInterviewState(
    "session",
    "llm_application_engineer",
    createFixtureCandidate("Candidate"),
  );
  startInterview(state);
  const step = submitAnswer(state, "召回模块是我的交付物。", [{
    claimIds: ["claim_rag_ownership"],
    competencyId: "software_engineering",
    statement: "候选人明确了个人交付边界。",
    polarity: "support",
    strength: 0.8,
    specificity: 0.9,
    evaluatorConfidence: 0.8,
    sourceQuote: "我的交付物",
  }]);
  assert.equal(step.evidence[0].statement, "候选人明确了个人交付边界。");
  assert.equal(step.evidence[0].sourceQuote, "我的交付物");
  assert.equal(state.candidate.projects[0].claims[0].status, "supported");
  assert.equal(step.decision.action, "SWITCH_TOPIC");
});

test("denial contradicts the claim and routes through one clarification", () => {
  const state = createInterviewState("session", "role", createFixtureCandidate("Candidate"));
  startInterview(state);
  const denial = submitAnswer(state, "这个模块不是我做的。", [{
    claimIds: ["claim_rag_ownership"],
    competencyId: "software_engineering",
    statement: "候选人否认本人完成该模块。",
    polarity: "invalidate",
    strength: 0.9,
    specificity: 0.9,
    evaluatorConfidence: 0.9,
    sourceQuote: "不是我做的",
  }], "denial");

  const claim = state.candidate.projects[0].claims[0];
  assert.equal(claim.status, "contradicted");
  assert.deepEqual(claim.contradictingEvidenceIds, [denial.evidence[0].id]);
  assert.equal(denial.decision.action, "CLARIFY_CONTRADICTION");
  assert.equal(denial.decision.skill, "consistency-check");

  const clarification = submitAnswer(state, "准确说法是我只负责召回模块。", [{
    claimIds: ["claim_rag_ownership"],
    competencyId: "software_engineering",
    statement: "候选人澄清了实际负责范围。",
    polarity: "weakness",
    strength: 0.8,
    specificity: 0.9,
    evaluatorConfidence: 0.85,
    sourceQuote: "我只负责召回模块",
  }], "substantive");
  assert.equal(claim.status, "contradicted");
  assert.equal(clarification.decision.action, "SWITCH_TOPIC");
  assert.equal(state.candidate.projects[0].topics[0].unresolvedGaps
    .find((gap) => gap.type === "contradiction:claim_rag_ownership")?.status, "resolved");
});

test("irrelevant answer adds no evidence and keeps the target gap open", () => {
  const state = createInterviewState("session", "role", createFixtureCandidate("Candidate"));
  startInterview(state);
  const step = submitAnswer(state, "我更想聊一下天气。", [], "irrelevant");
  assert.equal(step.evidence.length, 0);
  assert.equal(step.decision.action, "CONTINUE_TOPIC");
  assert.equal(state.candidate.projects[0].topics[0].unresolvedGaps[0].status, "open");
});

test("policy follows an extracted lead by probe and exits after two low-yield answers", () => {
  const state = createInterviewState("session", "role", createFixtureCandidate("Candidate"));
  startInterview(state);
  const evidence = (sourceQuote: string) => [{
    claimIds: ["claim_rag_ownership"],
    competencyId: "software_engineering",
    statement: "候选人说明了召回模块。",
    polarity: "support" as const,
    strength: 0.8,
    specificity: 0.9,
    evaluatorConfidence: 0.8,
    sourceQuote,
  }];
  const first = submitAnswer(state, "我负责 RAG 的召回模块，用的是 hybrid search。", evidence("我负责 RAG 的召回模块"), "substantive", {
    probeCoverage: [{ probe: "ownership_boundary", status: "sufficient", sourceQuote: "我负责 RAG 的召回模块" }],
    followUpLeads: [{
      text: "hybrid search", sourceQuote: "hybrid search", signal: "mechanism",
      probeCoverage: [{ probe: "technical_mechanism", status: "partial", sourceQuote: "hybrid search" }],
    }],
  });
  assert.equal(first.decision.selectedLead, "hybrid search");
  assert.equal(first.decision.selectedProbe, "technical_mechanism");
  assert.match(first.question ?? "", /hybrid search/);

  const second = submitAnswer(state, "BM25 和 embedding 各召回 50 条，然后通过 RRF 融合。", evidence("RRF 融合"), "substantive", {
    probeCoverage: [{ probe: "technical_mechanism", status: "sufficient", sourceQuote: "RRF 融合" }],
  });
  assert.equal(second.decision.selectedLead, "hybrid search");
  assert.equal(second.decision.selectedProbe, "decision_alternatives");

  submitAnswer(state, "记不清了。", [], "vague", { probeCoverage: [] });
  const exit = submitAnswer(state, "还是记不清。", [], "vague", { probeCoverage: [] });
  const lead = state.candidate.projects[0].topics[0].pendingLeads[0];
  assert.equal(lead.status, "low_value");
  assert.equal(lead.lowYieldCount, 2);
  assert.equal(exit.decision.action, "SWITCH_TOPIC");
  assert.equal(exit.decision.targetGap, "metric_definition");
});

test("progress reports evidence coverage separately from the turn limit", () => {
  const state = createInterviewState("session", "role", createFixtureCandidate("Candidate"));
  assert.deepEqual(getInterviewProgress(state, ["software_engineering", "evaluation"]), {
    stage: "not_started",
    coveragePercent: 0,
    turns: { completed: 0, max: 15 },
    projects: { covered: 0, total: 2 },
    topics: { covered: 0, total: 6 },
    gaps: { closed: 0, total: 6 },
    coreCompetencies: { covered: 0, total: 2 },
    contradictionsOpen: 0,
  });
  startInterview(state);
  submitAnswer(state, "我负责检索架构设计，并独立实现了召回模块和 reranker 接入。");
  const progress = getInterviewProgress(state, ["software_engineering", "evaluation"]);
  assert.equal(progress.stage, "interviewing");
  assert.equal(progress.coveragePercent, 25);
  assert.deepEqual(progress.projects, { covered: 1, total: 2 });
  assert.deepEqual(progress.topics, { covered: 1, total: 6 });
  assert.deepEqual(progress.gaps, { closed: 1, total: 6 });
  assert.deepEqual(progress.coreCompetencies, { covered: 1, total: 2 });
});
