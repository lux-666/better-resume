import assert from "node:assert/strict";
import test from "node:test";
import { createFixtureCandidate, createInterviewState, startInterview, submitAnswer } from "./index.ts";
import { fixedProfileResponse, fixedProfiles, type FixedProfileName } from "./fixed-profiles.ts";

for (const profile of Object.keys(fixedProfiles) as FixedProfileName[]) {
  test(`${profile} fixed profile completes a traceable 6–10 turn interview`, () => {
    const state = createInterviewState(`session-${profile}`, "llm_application_engineer", createFixtureCandidate(profile));
    startInterview(state);
    const questions: string[] = [];
    while (state.status === "active") {
      assert.ok(state.currentQuestion);
      questions.push(state.currentQuestion);
      const response = fixedProfileResponse(profile, state);
      submitAnswer(state, response.answer, response.evidence, response.disposition);
      assert.ok(state.turns.length <= 10, `${profile} exceeded the acceptance turn limit`);
    }

    assert.equal(state.turns.length, fixedProfiles[profile].expectedTurns);
    assert.equal(new Set(questions).size, questions.length);
    assert.equal(state.traces.length, state.turns.length + 1);
    assert.ok(state.traces.some((trace) => trace.action === "SWITCH_PROJECT"));
    const skills = new Set(state.traces.map((trace) => trace.selectedSkill));
    for (const skill of ["ownership-grill", "metric-audit", "failure-forensics"]) {
      assert.ok(skills.has(skill), `${profile} did not execute ${skill}`);
    }
    if (profile === "contradictory") {
      assert.ok(state.traces.some((trace) => trace.action === "CLARIFY_CONTRADICTION"));
      assert.ok(skills.has("consistency-check"));
    }
    assert.equal(state.candidate.projects.filter((project) => project.status === "active").length, 0);
    assert.equal(state.candidate.projects.flatMap((project) => project.topics)
      .filter((topic) => topic.status === "active").length, 0);
    for (const turn of state.turns) {
      assert.ok(state.traces.some((trace) => trace.turnId === turn.id));
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
