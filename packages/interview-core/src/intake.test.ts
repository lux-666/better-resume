import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCandidateFromIntake,
  buildInterviewRole,
  createInterviewState,
  getDemoInterviewDecision,
  normalizeInterviewIntake,
  type InterviewIntake,
} from "./index.ts";

test("candidate intake requires and preserves structured projects", () => {
  const intake = normalizeInterviewIntake({
    candidate: {
      name: "普通候选人",
      skills: ["用户研究", "数据分析"],
      projects: [{
        name: "用户增长实验",
        description: "作为项目负责人使用 SQL 设计活动流程并完成上线，转化率提升 12%。",
      }],
    },
  });
  const role = buildInterviewRole({});
  const candidate = buildCandidateFromIntake(intake, role);
  const state = createInterviewState("session", role, candidate, intake);

  assert.equal(role.id, "general_candidate");
  assert.equal(role.competencies.find((item) => item.id === "role_capability")?.name, "项目相关能力");
  assert.equal(candidate.projects.length, 1);
  assert.equal(candidate.projects[0].name, "用户增长实验");
  assert.deepEqual(candidate.projects[0].technologies, []);
  assert.deepEqual(candidate.projects[0].outcomes, []);
  assert.ok(candidate.projects[0].claims.every((claim) => claim.source === "candidate_input"));
  assert.deepEqual(candidate.projects[0].claims.map((claim) => claim.sourceQuote), [
    "作为项目负责人使用 SQL 设计活动流程并完成上线，转化率提升 12%。",
  ]);
  assert.equal(state.intake.candidate.projects.length, 1);
  assert.equal(state.report.fields.length, 4);
  const mechanism = state.report.fields.find((field) => field.id.endsWith(":mechanism"))!;
  assert.equal(mechanism.name, "关键方法与选择依据");
  assert.equal(mechanism.competencyId, "role_capability");
  state.report.fields.find((field) => field.id.endsWith(":ownership"))!.status = "supported";
  const decision = getDemoInterviewDecision(state);
  assert.equal(decision.action, "ASK_CANDIDATE");
  assert.match(decision.question ?? "", /用户增长实验/);
  assert.doesNotMatch(decision.question ?? "", /技术机制|架构|测试集|真实失败/);
  assert.throws(() => normalizeInterviewIntake({
    candidate: { name: "缺少项目", skills: [], projects: [] },
  }), /At least one candidate project/);
  assert.throws(() => normalizeInterviewIntake({
    candidate: { name: "空项目", skills: [], projects: [{ name: "项目", description: "" }] },
  }), /requires a description/);
});

test("structured job fields create a session-specific role without retaining raw documents", () => {
  const intake = normalizeInterviewIntake({
    candidate: {
      name: "林青",
      skills: ["Go", "PostgreSQL"],
      projects: [{
        name: "订单服务改造",
        description: "作为核心开发重构交易链路，接口延迟降低 35%。",
      }],
    },
    job: {
      title: "支付平台工程师",
      introduction: "负责支付平台核心系统。",
      responsibilities: "设计高并发交易链路。",
      requirements: "熟悉 Go\n具备数据库性能优化经验",
    },
  } satisfies InterviewIntake);
  const role = buildInterviewRole({ job: intake.job });
  const candidate = buildCandidateFromIntake(intake, role);

  assert.match(role.id, /^custom_job_/);
  assert.equal(role.name, "支付平台工程师");
  assert.equal(role.source, "job_description");
  assert.deepEqual(role.requirements, ["熟悉 Go", "具备数据库性能优化经验"]);
  assert.ok(candidate.projects[0].mappedCompetencies.includes("role_capability"));
  assert.equal("resume" in intake, false);
  assert.equal("jobDescription" in intake, false);
});
