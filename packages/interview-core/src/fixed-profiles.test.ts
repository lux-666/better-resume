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
