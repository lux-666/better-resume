import assert from "node:assert/strict";
import test from "node:test";
import {
  createFixtureCandidate, createInterviewState, startInterview, submitAnswer, type InterviewState,
} from "../../../packages/interview-core/src/index.ts";
import { fixedProfileResponse, type ModelProfileName } from "../../../packages/interview-core/src/fixed-profiles.ts";
import { evaluateProfileRun, type EvaluationTurn } from "./evaluation-gates.ts";
import { buildEvaluationScorecard, renderEvaluationScorecard } from "./evaluation-scorecard.ts";

function completedRun(): { state: InterviewState; turns: EvaluationTurn[] } {
  const state = createInterviewState("gate", "role", createFixtureCandidate("gate"));
  const turns: EvaluationTurn[] = [];
  startInterview(state);
  while (state.status === "active") {
    const trace = state.traces.at(-1)!;
    const response = fixedProfileResponse("strong", state);
    const step = submitAnswer(state, response.answer, response.evidence, response.disposition);
    const turn = state.turns.at(-1)!;
    turns.push({
      index: turn.index,
      retryCount: 0,
      question: turn.question,
      targetFieldId: turn.reportFieldId,
      reason: trace.reason,
      answer: turn.answer,
      edit: { answerDisposition: response.disposition, evidence: response.evidence },
      rejectedFinishes: [],
      expectedDisposition: response.disposition,
      expectedEvidence: response.evidence.map((item) => ({
        ...item, reportFieldIds: [...item.reportFieldIds], claimIds: [...item.claimIds],
      })),
    });
    assert.equal(step.state, state);
  }
  return { state, turns };
}

const codes = (profile: ModelProfileName, state: InterviewState, turns: EvaluationTurn[]) =>
  new Set(evaluateProfileRun(profile, state, turns).map((failure) => failure.code));

test("a grounded completed run passes the common behavior gates", () => {
  const { state, turns } = completedRun();
  assert.deepEqual(evaluateProfileRun("strong", state, turns), []);
});

test("scorecard reports deterministic quality metrics and unavailable token fields", () => {
  const { state, turns } = completedRun();
  const scorecard = buildEvaluationScorecard({ profile: "strong", state, turns, failures: [], telemetry: [] });
  assert.equal(scorecard.questionQuality.singleFocus.rate, 1);
  assert.equal(scorecard.questionQuality.duplicateRate.rate, 0);
  assert.equal(scorecard.evidenceExtraction.reportFields.precision.rate, 1);
  assert.equal(scorecard.evidenceExtraction.reportFields.recall.rate, 1);
  assert.equal(scorecard.evidenceExtraction.answerDisposition.rate, 1);
  assert.equal(scorecard.completion.requiredCoverage.rate, 1);
  assert.equal(scorecard.telemetry.cachedReadTokens, null);
  assert.match(renderEvaluationScorecard(scorecard), /Required coverage: 100%/);

  const secondIndex = turns.findIndex((turn) =>
    turn.expectedEvidence?.[0]?.reportFieldIds[0] !== turns[0].expectedEvidence?.[0]?.reportFieldIds[0]);
  assert.ok(secondIndex > 0);
  const first = turns[0].edit.evidence[0].reportFieldIds;
  turns[0].edit.evidence[0].reportFieldIds = turns[secondIndex].edit.evidence[0].reportFieldIds;
  turns[secondIndex].edit.evidence[0].reportFieldIds = first;
  const wrongTurn = buildEvaluationScorecard({ profile: "strong", state, turns, failures: [], telemetry: [] });
  assert.ok((wrongTurn.evidenceExtraction.reportFields.precision.rate ?? 1) < 1);
});

test("critical gates reject grounding, references, completion, and turn-limit violations", () => {
  {
    const { state, turns } = completedRun();
    state.evidence[0].sourceQuote = "invented quote";
    assert.ok(codes("strong", state, turns).has("ungrounded_quote"));
  }
  {
    const { state, turns } = completedRun();
    state.evidence[0].claimIds = ["invented_claim"];
    state.evidence[0].reportFieldIds = ["invented_field"];
    const failures = codes("strong", state, turns);
    assert.ok(failures.has("unknown_claim"));
    assert.ok(failures.has("invalid_report_field"));
  }
  {
    const { state, turns } = completedRun();
    state.report.contradictions.push({
      id: "open", claimId: "claim_rag_ownership", status: "open", evidenceIds: [], resolutionEvidenceIds: [],
    });
    state.report.fields[0].status = "missing";
    const failures = codes("strong", state, turns);
    assert.ok(failures.has("open_contradiction"));
    assert.ok(failures.has("missing_required_field"));
  }
  {
    const { state, turns } = completedRun();
    while (state.turns.length <= 15) state.turns.push({ ...state.turns[0], id: crypto.randomUUID() });
    assert.ok(codes("strong", state, turns).has("turn_limit_exceeded"));
  }
});

test("major gates reject repetition, semantic promotion, missed scenarios, and hard-limit drag", () => {
  {
    const { state, turns } = completedRun();
    state.turns[1].question = state.turns[0].question;
    turns[0].edit = {
      answerDisposition: "vague",
      evidence: [{ ...turns[0].edit.evidence[0], polarity: "support" }],
    };
    const failures = codes("strong", state, turns);
    assert.ok(failures.has("duplicate_question"));
    assert.ok(failures.has("vague_promoted"));
  }
  {
    const { state, turns } = completedRun();
    turns[0].edit = { answerDisposition: "irrelevant", evidence: turns[0].edit.evidence };
    assert.ok(codes("strong", state, turns).has("irrelevant_evidence"));
  }
  {
    const { state, turns } = completedRun();
    const singleFieldTurns = turns.map((turn) => ({
      ...turn,
      edit: { ...turn.edit, evidence: turn.edit.evidence.slice(0, 1) },
    }));
    assert.ok(codes("multi_field", state, singleFieldTurns).has("multi_field_missed"));
    assert.ok(codes("vertical_depth", state, turns).has("vertical_depth_missed"));
    const evasive = codes("evasive", state, turns);
    assert.ok(evasive.has("irrelevant_case_missing"));
    assert.ok(evasive.has("vague_case_missing"));
    assert.ok(codes("contradictory", state, turns).has("contradiction_case_missing"));
  }
  {
    const { state, turns } = completedRun();
    while (state.turns.length < 15) {
      state.turns.push({
        ...state.turns[0], id: crypto.randomUUID(), question: `补充问题 ${state.turns.length}？`,
      });
    }
    assert.ok(codes("strong", state, turns).has("ineffective_until_hard_limit"));
  }
});
