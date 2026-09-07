import assert from "node:assert/strict";
import test from "node:test";
import { buildAssessment } from "./assessment.ts";
import { createFixtureCandidate, createInterviewState, startInterview, recordAnswer } from "./index.ts";
import type { RequirementMatrix } from "./phase4-schema.ts";

test("assessment separates demonstrated depth, missing data, JD coverage, conflict and source integrity", () => {
  const state = createInterviewState("assessment", "role", createFixtureCandidate());
  startInterview(state);
  const field = state.report.fields.find((item) => item.id === state.traces.at(-1)?.targetFieldId)!;
  recordAnswer(state, "我用固定样本对照，是为了排除输入差异", [{
    reportFieldIds: [field.id], competencyId: field.competencyId, claimIds: [], sourceQuote: "我用固定样本对照", statement: "用固定样本对照",
    polarity: "support", strength: .9, specificity: .9, evaluatorConfidence: .9, depthLevel: 3,
  }]);
  const generic = buildAssessment(state, [], true);
  assert.equal(generic.dimensions.find((item) => item.competencyId === field.competencyId)!.score, 60);
  assert.ok(generic.dimensions.some((item) => item.score === null && item.status === "unassessed"));
  assert.equal(generic.match.score, null);
  const matrix: RequirementMatrix = [
    { requirementId: "r1", text: "必须能解释方案", priority: "must", status: "supported", evidenceIds: [state.evidence[0].id], projectIds: [field.projectId] },
    { requirementId: "r2", text: "应掌握结果验证", priority: "should", status: "partial", evidenceIds: [state.evidence[0].id], projectIds: [field.projectId] },
    { requirementId: "r3", text: "必须具备迁移能力", priority: "must", status: "not_investigated", evidenceIds: [], projectIds: [field.projectId] },
  ];
  state.role.source = "job_description";
  const partial = buildAssessment(state, matrix, true);
  assert.equal(partial.match.score, 84);
  assert.equal(partial.match.coveragePercent, 63);
  assert.equal(partial.match.status, "provisional");
  assert.deepEqual(partial.match.blockers, ["必须具备迁移能力"]);
  state.evidence.push({ ...state.evidence[0], id: "repeated" }); field.evidenceIds.push("repeated");
  assert.deepEqual(buildAssessment(state, matrix, true).match, partial.match);
  assert.equal(buildAssessment(state, matrix, true).dimensions.find((item) => item.competencyId === field.competencyId)!.score, 60);
  matrix[2].status = "contradicted";
  assert.equal(buildAssessment(state, matrix, true).match.score, 53);
  field.status = "contradicted";
  assert.equal(buildAssessment(state, matrix, true).dimensions.find((item) => item.competencyId === field.competencyId)!.score, null);
  const invalid = buildAssessment(state, matrix, false);
  assert.equal(invalid.match.score, null); assert.ok(invalid.dimensions.every((item) => item.score === null));
});
