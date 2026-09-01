import assert from "node:assert/strict";
import test from "node:test";
import { createFixtureCandidate, createInterviewState, startInterview, submitAnswer } from "./index.ts";
import { fixedProfileResponse, fixedProfiles, type FixedProfileName } from "./fixed-profiles.ts";

for (const profile of Object.keys(fixedProfiles) as FixedProfileName[]) {
  test(`${profile} fixed profile completes a grounded Candidate Report`, () => {
    const state = createInterviewState(`session-${profile}`, "llm_application_engineer", createFixtureCandidate(profile));
    startInterview(state);
    const questions: string[] = [];
    while (state.status === "active") {
      assert.ok(state.currentQuestion);
      questions.push(state.currentQuestion);
      const response = fixedProfileResponse(profile, state);
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
    if (profile === "strong") assert.ok(claims.every((claim) => claim.status === "supported"));
    if (profile === "weak") assert.ok(claims.every((claim) => claim.status === "weakened"));
    if (profile === "contradictory") {
      assert.equal(claims.filter((claim) => claim.status === "contradicted").length, 2);
    }
    assert.throws(() => submitAnswer(state, "完成后不应接受新回答。"));
  });
}
