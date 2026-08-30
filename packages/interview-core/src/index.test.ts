import assert from "node:assert/strict";
import test from "node:test";
import {
  createInterviewState, getNextInterviewAction, selectAnchorProject,
  type CandidateProfile, type Project,
} from "./index.ts";

const project = (id: string, relevance: number): Project => ({
  id, name: id, description: "", technologies: ["TypeScript"], outcomes: [], claims: [],
  mappedCompetencies: ["software_engineering"], topics: [], status: "unexplored", roleRelevance: relevance,
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
