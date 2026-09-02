import {
  activateInterview,
  applyInterviewDecision,
  createFixtureCandidate,
  createInterviewState,
  recordAnswer,
  type InterviewState,
} from "../../../packages/interview-core/src/index.ts";
import {
  fixedProfileResponse,
  modelProfiles,
  type ModelProfileName,
} from "../../../packages/interview-core/src/fixed-profiles.ts";
import {
  decideNextStepWithAgent,
  editReportWithAgent,
  EvidenceValidationError,
  ModelProviderError,
  TelemetryCollector,
  type TelemetryTrace,
  withOneProviderRetry,
} from "../../../packages/pi-runtime/src/index.ts";
import {
  evaluateProfileRun,
  minimalFailureTranscript,
  type EvaluationTurn,
} from "./evaluation-gates.ts";
import { createModelRuntime } from "./model-runtime.ts";
import { buildEvaluationScorecard, renderEvaluationScorecard } from "./evaluation-scorecard.ts";

const requested = process.argv[2] ?? "all";
if (requested === "--help") {
  console.log(`Usage: npm run eval:model -- ${Object.keys(modelProfiles).join("|")}|all`);
  process.exit(0);
}
const profiles = requested === "all"
  ? Object.keys(modelProfiles) as ModelProfileName[]
  : [requested as ModelProfileName];
if (profiles.some((profile) => !(profile in modelProfiles))) {
  throw new Error(`Profile must be ${Object.keys(modelProfiles).join(", ")}, or all`);
}

const { provider, modelId, model, streamFn } = createModelRuntime();
if (!provider || !modelId || !model || !streamFn) throw new Error("LLM configuration is required");
const configuredModel = model;
const configuredStreamFn = streamFn;

type EvaluationStage = "initial_decision" | "report_edit" | "next_decision" | "behavior_gate";

class ProfileEvaluationError extends Error {
  constructor(
    readonly profile: ModelProfileName,
    readonly stage: EvaluationStage,
    readonly question: string | undefined,
    readonly answer: string | undefined,
    readonly retryCount: number,
    readonly completedTurns: EvaluationTurn[],
    readonly original: unknown,
  ) {
    super(original instanceof Error ? original.message : "Unknown evaluation error");
    this.name = "ProfileEvaluationError";
  }
}

async function askOrFinish(
  state: InterviewState,
  turnId: string | undefined,
  onRetry: () => void,
  telemetry: TelemetryCollector,
): Promise<string[][]> {
  const rejected: string[][] = [];
  const decision = await withOneProviderRetry(() => decideNextStepWithAgent({
    model: configuredModel,
    streamFn: configuredStreamFn,
    state,
    telemetry,
    onFinishRejected: (blockers) => rejected.push([...blockers]),
  }), onRetry);
  applyInterviewDecision(state, decision, turnId);
  return rejected;
}

async function runProfile(profile: ModelProfileName): Promise<boolean> {
  const state = createInterviewState(
    `model-eval-${profile}-${Date.now()}`,
    "llm_application_engineer",
    createFixtureCandidate(profile),
  );
  const turns: EvaluationTurn[] = [];
  const telemetry: TelemetryTrace[] = [];
  let stage: EvaluationStage = "initial_decision";
  let answer: string | undefined;
  let stageRetryCount = 0;
  try {
    activateInterview(state);
    let pendingRetryCount = 0;
    const initialTelemetry = new TelemetryCollector({ sessionId: state.sessionId });
    let pendingRejectedFinishes = await askOrFinish(
      state, undefined, () => { pendingRetryCount += 1; }, initialTelemetry,
    );
    telemetry.push(initialTelemetry.trace);
    while (state.status === "active") {
      const trace = state.traces.at(-1)!;
      const response = fixedProfileResponse(profile, state);
      const turnTelemetry = new TelemetryCollector({ sessionId: state.sessionId });
      answer = response.answer;
      stage = "report_edit";
      stageRetryCount = 0;
      const edit = await withOneProviderRetry(() => editReportWithAgent({
        model: configuredModel,
        streamFn: configuredStreamFn,
        state,
        answer: response.answer,
        telemetry: turnTelemetry,
      }), () => { stageRetryCount += 1; });
      const record = recordAnswer(state, response.answer, edit.evidence, edit.answerDisposition);
      turnTelemetry.trace.turnId = record.turn.id;
      for (const span of turnTelemetry.trace.spans) span.turnId ??= record.turn.id;
      const editRetryCount = stageRetryCount;
      stage = "next_decision";
      stageRetryCount = 0;
      const rejectedFinishes = await askOrFinish(
        state,
        record.turn.id,
        () => { stageRetryCount += 1; },
        turnTelemetry,
      );
      telemetry.push(turnTelemetry.trace);
      turns.push({
        index: record.turn.index,
        retryCount: pendingRetryCount + editRetryCount + stageRetryCount,
        question: record.turn.question,
        targetFieldId: record.turn.reportFieldId,
        reason: trace.reason,
        answer: record.turn.answer,
        edit,
        rejectedFinishes: [...pendingRejectedFinishes, ...rejectedFinishes],
        expectedDisposition: response.disposition,
        expectedEvidence: response.evidence,
      });
      pendingRejectedFinishes = [];
      pendingRetryCount = 0;
      answer = undefined;
    }
  } catch (error) {
    throw new ProfileEvaluationError(
      profile,
      stage,
      state.currentQuestion,
      answer,
      stageRetryCount,
      turns.slice(-1),
      error,
    );
  }

  stage = "behavior_gate";
  const failures = evaluateProfileRun(profile, state, turns);
  const scorecard = buildEvaluationScorecard({ profile, state, turns, failures, telemetry });
  console.log(JSON.stringify({
    type: "profile_result",
    status: failures.length === 0 ? "passed" : "failed",
    profile,
    provider,
    modelId,
    turns: turns.map((turn) => ({
      ...turn,
      answerDisposition: turn.edit.answerDisposition,
      evidence: turn.edit.evidence.map(({ reportFieldIds, polarity, sourceQuote }) => ({
        reportFieldIds, polarity, sourceQuote,
      })),
      edit: undefined,
    })),
    report: state.report.fields.map(({ id, status, evidenceIds }) => ({ id, status, evidenceIds })),
    contradictions: state.report.contradictions,
    scorecard,
    scorecardMarkdown: renderEvaluationScorecard(scorecard),
    telemetry,
    failures: failures.map((failure) => ({
      ...failure,
      transcript: minimalFailureTranscript(turns, failure),
    })),
  }));
  return failures.length === 0;
}

try {
  const results: boolean[] = [];
  for (const profile of profiles) results.push(await runProfile(profile));
  if (results.some((passed) => !passed)) process.exitCode = 1;
} catch (error) {
  const original = error instanceof ProfileEvaluationError ? error.original : error;
  const category = original instanceof ModelProviderError ? "provider"
    : original instanceof EvidenceValidationError ? "model_output" : "runtime";
  console.error(JSON.stringify({
    type: "evaluation_error",
    category,
    profile: error instanceof ProfileEvaluationError ? error.profile : undefined,
    stage: error instanceof ProfileEvaluationError ? error.stage : undefined,
    retryCount: error instanceof ProfileEvaluationError ? error.retryCount : undefined,
    message: original instanceof Error ? original.message : "Unknown evaluation error",
    transcript: error instanceof ProfileEvaluationError ? [
      ...error.completedTurns.map(({ index, question, answer, targetFieldId }) => ({
        index, question, answer, targetFieldId,
      })),
      ...(error.question && error.answer ? [{
        index: error.completedTurns.at(-1)?.index === undefined
          ? 0 : error.completedTurns.at(-1)!.index + 1,
        question: error.question,
        answer: error.answer,
      }] : []),
    ] : [],
  }));
  process.exitCode = category === "provider" ? 2 : 1;
}
