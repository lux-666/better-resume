import { summarizeTelemetry } from "../../../packages/api-contract/src/telemetry-summary.ts";
import type { AnswerDisposition, EvidenceProposal, InterviewState } from "../../../packages/interview-core/src/index.ts";
import type { TelemetryTrace } from "../../../packages/pi-runtime/src/index.ts";
import type { EvaluationTurn, GateFailure } from "./evaluation-gates.ts";

type Ratio = { matched: number; total: number; rate: number | null };

function ratio(matched: number, total: number): Ratio {
  return { matched, total, rate: total === 0 ? null : Number((matched / total).toFixed(4)) };
}

function normalized(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function setCounts(expected: readonly string[], actual: readonly string[]) {
  const gold = new Set(expected);
  const observed = new Set(actual);
  const matched = [...observed].filter((item) => gold.has(item)).length;
  return { matched, observed: observed.size, gold: gold.size };
}

export function buildEvaluationScorecard(options: {
  profile: string;
  state: InterviewState;
  turns: readonly EvaluationTurn[];
  failures: readonly GateFailure[];
  telemetry: readonly TelemetryTrace[];
}) {
  const { profile, state, turns, failures, telemetry } = options;
  const runtimeSummary = summarizeTelemetry(telemetry);
  const validTargets = new Set(state.report.fields.map((field) => field.id));
  const questions = turns.map((turn) => normalized(turn.question));
  const duplicateCount = questions.filter((question, index) => questions.indexOf(question) !== index).length;
  const singleFocusCount = turns.filter((turn) => (turn.question.match(/[?？]/g)?.length ?? 0) === 1).length;
  const saturatedViolations = turns.filter((turn, index) => {
    const prior = turns.slice(0, index).filter((item) => item.targetFieldId === turn.targetFieldId).slice(-2);
    return prior.length === 2 && normalized(prior[0].answer) === normalized(prior[1].answer);
  }).length;
  const verticalDepthHit = turns.some((turn, index) => /hybrid search|RRF/i.test(turn.answer)
    && /hybrid|RRF|BM25|dense|融合|召回|稀疏|稠密|top.?k/i.test(turns[index + 1]?.question ?? ""));

  let fieldMatched = 0;
  let fieldObserved = 0;
  let fieldGold = 0;
  let claimMatched = 0;
  let claimObserved = 0;
  let claimGold = 0;
  let polarityMatches = 0;
  let polarityTotal = 0;
  let dispositionMatches = 0;
  let dispositionTotal = 0;
  for (const turn of turns) {
    const expected = turn.expectedEvidence ?? [];
    const fields = setCounts(
      expected.flatMap((item) => item.reportFieldIds),
      turn.edit.evidence.flatMap((item) => item.reportFieldIds),
    );
    fieldMatched += fields.matched;
    fieldObserved += fields.observed;
    fieldGold += fields.gold;
    const claims = setCounts(
      expected.flatMap((item) => item.claimIds),
      turn.edit.evidence.flatMap((item) => item.claimIds),
    );
    claimMatched += claims.matched;
    claimObserved += claims.observed;
    claimGold += claims.gold;
    if (turn.expectedDisposition) {
      dispositionTotal += 1;
      if (turn.edit.answerDisposition === turn.expectedDisposition) dispositionMatches += 1;
    }
    for (const actual of turn.edit.evidence) {
      const gold = expected.find((item) => item.reportFieldIds.some((id) => actual.reportFieldIds.includes(id)));
      if (!gold) continue;
      polarityTotal += 1;
      if (gold.polarity === actual.polarity) polarityMatches += 1;
    }
  }
  const modelSpans = telemetry.flatMap((trace) => trace.spans).filter((span) => span.kind === "model");
  const requiredFields = state.report.fields.filter((field) => field.importance >= 0.8);

  return {
    version: "1.5-b-v0.1",
    profile,
    questionQuality: {
      singleFocus: ratio(singleFocusCount, turns.length),
      duplicateRate: ratio(duplicateCount, turns.length),
      validTarget: ratio(turns.filter((turn) => turn.targetFieldId && validTargets.has(turn.targetFieldId)).length, turns.length),
    },
    followUpRelevance: {
      verticalDepthLeadFollowed: profile === "vertical_depth" ? verticalDepthHit : null,
      saturatedFieldViolations: saturatedViolations,
      rejectedPrematureFinishes: turns.reduce((sum, turn) => sum + turn.rejectedFinishes.length, 0),
    },
    evidenceExtraction: {
      reportFields: { precision: ratio(fieldMatched, fieldObserved), recall: ratio(fieldMatched, fieldGold) },
      claims: { precision: ratio(claimMatched, claimObserved), recall: ratio(claimMatched, claimGold) },
      polarity: ratio(polarityMatches, polarityTotal),
      answerDisposition: ratio(dispositionMatches, dispositionTotal),
      groundedQuotes: ratio(
        turns.reduce((sum, turn) => sum + turn.edit.evidence.filter((item) => turn.answer.includes(item.sourceQuote)).length, 0),
        turns.reduce((sum, turn) => sum + turn.edit.evidence.length, 0),
      ),
      contradictionObserved: profile === "contradictory" ? state.report.contradictions.length > 0 : null,
      contradictionResolved: profile === "contradictory"
        ? state.report.contradictions.length > 0 && state.report.contradictions.every((item) => item.status === "resolved") : null,
    },
    completion: {
      status: state.status,
      turns: state.turns.length,
      requiredCoverage: ratio(requiredFields.filter((field) => field.status !== "missing").length, requiredFields.length),
      hardLimitReached: state.turns.length >= 15,
      extraTurnsAfterRequiredCoverage: null,
    },
    failures: {
      critical: failures.filter((failure) => failure.severity === "critical").length,
      major: failures.filter((failure) => failure.severity === "major").length,
    },
    telemetry: {
      traces: telemetry.length,
      modelRequests: modelSpans.length,
      modelLatencyMs: runtimeSummary.modelDurationSumMs.value,
      summary: runtimeSummary,
      inputTokens: runtimeSummary.inputTokens.availability === "complete" ? runtimeSummary.inputTokens.value : null,
      outputTokens: runtimeSummary.outputTokens.availability === "complete" ? runtimeSummary.outputTokens.value : null,
      reasoningTokens: runtimeSummary.reasoningTokens.availability === "complete" ? runtimeSummary.reasoningTokens.value : null,
      cachedReadTokens: runtimeSummary.cacheReadTokens.availability === "complete" ? runtimeSummary.cacheReadTokens.value : null,
      cachedWriteTokens: runtimeSummary.cacheWriteTokens.availability === "complete" ? runtimeSummary.cacheWriteTokens.value : null,
      maxApproximateContextTokens: modelSpans.length === 0 ? null
        : Math.max(...modelSpans.map((span) => span.context?.approximateInputTokens ?? 0)),
      errors: telemetry.flatMap((trace) => trace.spans).filter((span) => span.error).length,
    },
    manualReview: {
      questionTargetsCandidateAnswer: null,
      questionValidatesCapability: null,
      followUpHitsCurrentGap: null,
      avoidsIrrelevantQuestion: null,
      notes: null,
    },
  };
}

export function renderEvaluationScorecard(scorecard: ReturnType<typeof buildEvaluationScorecard>): string {
  const percent = (value: number | null) => value === null ? "unavailable" : `${Math.round(value * 100)}%`;
  return [
    `# Evaluation Scorecard: ${scorecard.profile}`,
    "",
    `- Status: ${scorecard.completion.status}`,
    `- Turns: ${scorecard.completion.turns}`,
    `- Required coverage: ${percent(scorecard.completion.requiredCoverage.rate)}`,
    `- Single-focus questions: ${percent(scorecard.questionQuality.singleFocus.rate)}`,
    `- Duplicate question rate: ${percent(scorecard.questionQuality.duplicateRate.rate)}`,
    `- Evidence field precision / recall: ${percent(scorecard.evidenceExtraction.reportFields.precision.rate)} / ${percent(scorecard.evidenceExtraction.reportFields.recall.rate)}`,
    `- Claim precision / recall: ${percent(scorecard.evidenceExtraction.claims.precision.rate)} / ${percent(scorecard.evidenceExtraction.claims.recall.rate)}`,
    `- Critical / major failures: ${scorecard.failures.critical} / ${scorecard.failures.major}`,
    `- Model requests: ${scorecard.telemetry.modelRequests}`,
    `- Input / output tokens: ${scorecard.telemetry.inputTokens ?? "unavailable"} / ${scorecard.telemetry.outputTokens ?? "unavailable"}`,
    `- Cache read / write tokens: ${scorecard.telemetry.cachedReadTokens ?? "unavailable"} / ${scorecard.telemetry.cachedWriteTokens ?? "unavailable"}`,
    "",
    "Manual rubric fields remain null until a reviewer records ratings and reasons.",
  ].join("\n");
}

export type GoldEvaluationTurn = {
  expectedDisposition?: AnswerDisposition;
  expectedEvidence?: EvidenceProposal[];
};
