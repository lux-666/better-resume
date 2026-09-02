import assert from "node:assert/strict";
import test from "node:test";
import {
  applyInterviewDecision, createFixtureCandidate, createInterviewState, recordAnswer, startInterview, submitAnswer,
} from "./index.ts";
import {
  fixedProfileResponse, fixedProfiles, modelProfiles, type FixedProfileName,
} from "./fixed-profiles.ts";

for (const profile of Object.keys(fixedProfiles) as FixedProfileName[]) {
  test(`${profile} fixed profile completes a grounded Candidate Report`, () => {
    const state = createInterviewState(`session-${profile}`, "llm_application_engineer", createFixtureCandidate(profile));
    startInterview(state);
    const questions: string[] = [];
    const answers: string[] = [];
    while (state.status === "active") {
      assert.ok(state.currentQuestion);
      questions.push(state.currentQuestion);
      const response = fixedProfileResponse(profile, state);
      answers.push(response.answer);
      submitAnswer(state, response.answer, response.evidence, response.disposition);
    }

    assert.equal(state.turns.length, fixedProfiles[profile].expectedTurns);
    assert.equal(new Set(questions).size, questions.length);
    assert.equal(state.traces.length, state.turns.length + 1);
    assert.equal(state.traces.at(-1)?.action, "FINISH_INTERVIEW");
    assert.equal(state.report.status, "complete");
    assert.ok(state.report.fields.every((field) => field.status !== "missing"));
    assert.equal(state.report.contradictions.filter((item) => item.status === "open").length, 0);
    for (const evidence of state.evidence) {
      const turn = state.turns.find((item) => item.id === evidence.turnId);
      assert.ok(turn?.answer.includes(evidence.sourceQuote));
    }
    const claims = state.candidate.projects.flatMap((project) => project.claims);
    if (profile === "strong") {
      assert.ok(claims.every((claim) => claim.status === "supported"));
      assert.match(answers.join("\n"), /RRF.*70%.*85%.*幂等/s);
    }
    if (profile === "weak") assert.ok(claims.every((claim) => claim.status === "weakened"));
    if (profile === "contradictory") {
      assert.equal(claims.filter((claim) => claim.status === "contradicted").length, 2);
    }
    assert.throws(() => submitAnswer(state, "完成后不应接受新回答。"));
  });
}

test("model profiles cover multi-field, vertical-depth, and evasive behavior", () => {
  assert.deepEqual(Object.keys(modelProfiles), [
    "strong", "weak", "contradictory", "multi_field", "vertical_depth", "evasive",
  ]);

  const multi = createInterviewState("multi", "role", createFixtureCandidate("multi"));
  startInterview(multi);
  const dense = fixedProfileResponse("multi_field", multi);
  assert.ok(new Set(dense.evidence.flatMap((item) => item.reportFieldIds)).size >= 3);

  const vertical = createInterviewState("vertical", "role", createFixtureCandidate("vertical"));
  startInterview(vertical);
  assert.match(fixedProfileResponse("vertical_depth", vertical).answer, /hybrid search/);

  const evasive = createInterviewState("evasive", "role", createFixtureCandidate("evasive"));
  startInterview(evasive);
  const irrelevant = fixedProfileResponse("evasive", evasive);
  assert.equal(irrelevant.disposition, "irrelevant");
  assert.deepEqual(irrelevant.evidence, []);
  const record = recordAnswer(evasive, irrelevant.answer, [], irrelevant.disposition);
  applyInterviewDecision(evasive, {
    action: "ASK_CANDIDATE",
    targetFieldId: evasive.report.fields[1].id,
    reason: "Continue after an irrelevant answer.",
    question: "请具体说明这个项目的关键技术机制？",
  }, record.turn.id);
  assert.equal(fixedProfileResponse("evasive", evasive).disposition, "vague");
});

test("fixed-answer Gold labels every materially supported report field", () => {
  const strong = createInterviewState("strong-gold", "role", createFixtureCandidate("strong"));
  startInterview(strong);
  const failureField = strong.report.fields.find((field) => field.id === "project_enterprise_rag:failure")!;
  applyInterviewDecisionAfterAnsweringFields(strong, failureField.id);
  const failure = fixedProfileResponse("strong", strong);
  assert.deepEqual(new Set(failure.evidence.flatMap((item) => item.reportFieldIds)), new Set([
    "project_enterprise_rag:mechanism",
    "project_enterprise_rag:measurement",
    "project_enterprise_rag:failure",
  ]));

  const vertical = createInterviewState("vertical-gold", "role", createFixtureCandidate("vertical"));
  startInterview(vertical);
  const first = fixedProfileResponse("vertical_depth", vertical);
  assert.deepEqual(new Set(first.evidence.flatMap((item) => item.reportFieldIds)), new Set([
    "project_enterprise_rag:ownership",
    "project_enterprise_rag:mechanism",
  ]));

  const record = recordAnswer(vertical, first.answer, first.evidence, first.disposition);
  applyInterviewDecision(vertical, {
    action: "ASK_CANDIDATE",
    targetFieldId: "project_enterprise_rag:mechanism",
    reason: "Continue vertical-depth fixture.",
    question: "请具体说明两路召回如何融合？",
  }, record.turn.id);
  const second = fixedProfileResponse("vertical_depth", vertical);
  const secondRecord = recordAnswer(vertical, second.answer, second.evidence, second.disposition);
  applyInterviewDecision(vertical, {
    action: "ASK_CANDIDATE",
    targetFieldId: "project_enterprise_rag:measurement",
    reason: "Continue vertical-depth fixture.",
    question: "请说明 top-50 的选择依据？",
  }, secondRecord.turn.id);
  const third = fixedProfileResponse("vertical_depth", vertical);
  assert.deepEqual(third.evidence.flatMap((item) => item.claimIds), []);
});

function applyInterviewDecisionAfterAnsweringFields(state: ReturnType<typeof createInterviewState>, targetFieldId: string) {
  state.currentQuestion = undefined;
  applyInterviewDecision(state, {
    action: "ASK_CANDIDATE",
    targetFieldId,
    reason: "Gold fixture target.",
    question: "请讲一次真实失败、根因、修复与验证？",
  });
}
