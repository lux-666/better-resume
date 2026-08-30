import assert from "node:assert/strict";
import test from "node:test";
import {
  createFixtureCandidate, createInterviewState, getNextInterviewAction, selectAnchorProject,
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
  assert.equal(metric.decision.action, "FINISH");
  assert.equal(state.status, "completed");
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
