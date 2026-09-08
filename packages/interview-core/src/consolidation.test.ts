import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildCandidateFromIntake, buildInterviewRole, createInterviewState, interviewTimeBudgetExhausted, validateCompletion } from "./index.ts";
import { requirementLines } from "./intake.ts";
import { jdLines } from "./role-pack.ts";
test("generic and Role Pack paths preserve the same complete numbered JD lines", () => {
  const lines = Array.from({ length: 14 }, (_, i) => `${i + 1}. 必须解释第${i + 1}项机制${"及实际约束".repeat(55)}`);
  const job = { title: "后端工程师", introduction: "系统开发", responsibilities: "设计服务", requirements: ` ${lines.join("\n")} \n\n${lines[0]}` };
  const intake = { candidate: { name: "Test", skills: [], projects: [{ name: "服务", description: "实现系统" }] }, job };
  const role = buildInterviewRole({ job }); const state = createInterviewState("jd", role, buildCandidateFromIntake(intake, role), intake);
  assert.deepEqual(role.requirements, lines); assert.deepEqual(jdLines(state), role.requirements); assert.deepEqual(requirementLines(undefined), []);
});
test("time reminder boundary does not force completion, with absent or invalid dates remaining unexpired", () => {
  const start = Date.parse("2026-09-01T00:00:00Z");
  const budget = { startedAt: new Date(start).toISOString(), timeBudgetMinutes: 20 };
  assert.equal(interviewTimeBudgetExhausted(budget, start + 20 * 60_000 - 1), false);
  assert.equal(interviewTimeBudgetExhausted(budget, start + 20 * 60_000), true);
  assert.equal(interviewTimeBudgetExhausted({ timeBudgetMinutes: 20 }, start), false);
  assert.equal(interviewTimeBudgetExhausted({ ...budget, startedAt: "invalid" }, start), false);
  const intake = { candidate: { name: "Test", skills: [], projects: [{ name: "服务", description: "实现系统" }] } };
  const role = buildInterviewRole({}); const state = createInterviewState("time", role, buildCandidateFromIntake(intake, role), intake);
  Object.assign(state, budget, { startedAt: new Date(Date.now() - 21 * 60_000).toISOString() }); assert.equal(validateCompletion(state).forced, false);
});
test("single-source workflow documents the live boundaries and regression gate", () => {
  const doc = readFileSync(new URL("../../../docs/development.md", import.meta.url), "utf8");
  for (const symbol of ["requirementLines", "buildSummary", "withOneProviderRetry", "runModelStage", "interviewTimeBudgetExhausted", "InterviewStateResponseSchema", "RequirementStatusSchema", "Claim", "ReportContradiction", "check:duplication", "test-helpers.ts", "noUnusedLocals", "noUnusedParameters"]) assert.ok(doc.includes(symbol), `Workflow must name ${symbol}`);
});
