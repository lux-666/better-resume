import {
  activateInterview,
  applyInterviewDecision,
  buildCandidateFromIntake,
  buildInterviewReportBundle,
  buildInterviewRole,
  createFixtureCandidate,
  createInterviewState,
  normalizeInterviewIntake,
  recordAnswer,
  type InterviewIntake,
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
import { createModelRuntime, resolveAgentModelIds } from "./model-runtime.ts";
import { buildEvaluationScorecard, renderEvaluationScorecard } from "./evaluation-scorecard.ts";

const releaseScenarios: Array<{ id: string; profile: ModelProfileName; intake: InterviewIntake }> = [
  {
    id: "single-project-strong",
    profile: "strong",
    intake: {
      candidate: {
        name: "P2-S1",
        skills: ["流程设计", "数据分析", "项目协作"],
        projects: [{
          name: "客户工单流程优化",
          description: "负责客户工单流程设计与上线，通过固定样本验证使处理成功率从 62% 提升到 78%。",
        }],
      },
      job: {
        title: "业务流程经理",
        introduction: "负责客户服务流程设计与持续改进。",
        responsibilities: "设计业务流程，推动跨团队上线并复盘结果。",
        requirements: "具备流程设计经验\n能够使用数据验证改进效果",
      },
    },
  },
  {
    id: "multi-project-contradictory",
    profile: "contradictory",
    intake: {
      candidate: {
        name: "P2-S2",
        skills: ["运营策略", "数据分析"],
        projects: [
          { name: "会员召回活动", description: "负责会员召回策略设计，带动月活提升 11%。" },
          { name: "商家分层运营", description: "主导商家分层规则和运营流程落地。" },
        ],
      },
      job: {
        title: "运营策略经理",
        introduction: "负责用户与商家运营策略。",
        responsibilities: "制定分层策略，协调执行并评估业务效果。",
        requirements: "具备策略设计经验\n能够独立分析运营结果",
      },
    },
  },
  {
    id: "sparse-input-weak",
    profile: "weak",
    intake: {
      candidate: {
        name: "P2-S3",
        skills: [],
        projects: [{ name: "客户活动支持", description: "负责过客户活动支持。" }],
      },
    },
  },
];

const requested = process.argv[2] ?? "all";
if (requested === "--help") {
  console.log(`Usage: npm run eval:model -- ${Object.keys(modelProfiles).join("|")}|all|release`);
  process.exit(0);
}
const profiles = requested === "release" ? releaseScenarios.map(({ profile }) => profile) : requested === "all"
  ? Object.keys(modelProfiles) as ModelProfileName[]
  : [requested as ModelProfileName];
if (profiles.some((profile) => !(profile in modelProfiles))) {
  throw new Error(`Profile must be ${Object.keys(modelProfiles).join(", ")}, or all`);
}

const { reportModelId, interviewModelId } = resolveAgentModelIds();
const reportRuntime = createModelRuntime(process.env, reportModelId);
const interviewRuntime = createModelRuntime(process.env, interviewModelId);
if (!reportRuntime.provider || !reportRuntime.model || !reportRuntime.streamFn
  || !interviewRuntime.provider || !interviewRuntime.model || !interviewRuntime.streamFn) {
  throw new Error("LLM configuration is required");
}
if (reportRuntime.provider !== interviewRuntime.provider) throw new Error("Evaluation models must use one provider");
const provider = reportRuntime.provider;
const reportModel = reportRuntime.model;
const reportStreamFn = reportRuntime.streamFn;
const interviewModel = interviewRuntime.model;
const interviewStreamFn = interviewRuntime.streamFn;

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
    readonly telemetry: TelemetryTrace[],
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
  let attempt = 1;
  const decision = await withOneProviderRetry(() => decideNextStepWithAgent({
    model: interviewModel,
    streamFn: interviewStreamFn,
    state,
    telemetry,
    attempt,
    onFinishRejected: (blockers) => rejected.push([...blockers]),
  }), () => { attempt += 1; onRetry(); });
  applyInterviewDecision(state, decision, turnId);
  return rejected;
}

async function runProfile(profile: ModelProfileName): Promise<boolean> {
  const releaseScenario = requested === "release" ? releaseScenarios.find((item) => item.profile === profile) : undefined;
  const intake = releaseScenario ? normalizeInterviewIntake(releaseScenario.intake) : undefined;
  const role = intake ? buildInterviewRole({ job: intake.job }) : undefined;
  const state = createInterviewState(
    `model-eval-${releaseScenario?.id ?? profile}-${Date.now()}`,
    role ?? "llm_application_engineer",
    intake && role ? buildCandidateFromIntake(intake, role) : createFixtureCandidate(profile),
    intake,
  );
  const turns: EvaluationTurn[] = [];
  const telemetry: TelemetryTrace[] = [];
  let currentTelemetry: TelemetryCollector | undefined;
  let stage: EvaluationStage = "initial_decision";
  let answer: string | undefined;
  let stageRetryCount = 0;
  try {
    activateInterview(state);
    let pendingRetryCount = 0;
    const initialTelemetry = new TelemetryCollector({ sessionId: state.sessionId, operation: "evaluation_start" });
    currentTelemetry = initialTelemetry;
    telemetry.push(initialTelemetry.trace);
    let pendingRejectedFinishes = await askOrFinish(
      state, undefined, () => { pendingRetryCount += 1; }, initialTelemetry,
    );
    initialTelemetry.end("succeeded");
    while (state.status === "active") {
      const trace = state.traces.at(-1)!;
      const response = fixedProfileResponse(profile, state);
      const turnTelemetry = new TelemetryCollector({ sessionId: state.sessionId, operation: "evaluation_answer" });
      currentTelemetry = turnTelemetry;
      telemetry.push(turnTelemetry.trace);
      answer = response.answer;
      stage = "report_edit";
      stageRetryCount = 0;
      const edit = await withOneProviderRetry(() => editReportWithAgent({
        model: reportModel,
        streamFn: reportStreamFn,
        state,
        answer: response.answer,
        telemetry: turnTelemetry,
        attempt: stageRetryCount + 1,
      }), () => { stageRetryCount += 1; });
      const record = recordAnswer(state, response.answer, edit.evidence, edit.answerDisposition, edit.leads);
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
      turnTelemetry.end("succeeded");
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
    currentTelemetry?.end("failed");
    throw new ProfileEvaluationError(
      profile,
      stage,
      state.currentQuestion,
      answer,
      stageRetryCount,
      turns.slice(-1),
      error,
      telemetry,
    );
  }

  stage = "behavior_gate";
  const failures = evaluateProfileRun(profile, state, turns);
  const reportBundle = buildInterviewReportBundle(state);
  if (!reportBundle.report.integrity.valid) {
    failures.push({
      severity: "critical",
      code: "report_integrity",
      message: reportBundle.report.integrity.errors.join("; "),
    });
  }
  const scorecard = buildEvaluationScorecard({ profile, state, turns, failures, telemetry });
  console.log(JSON.stringify({
    type: "profile_result",
    status: failures.length === 0 ? "passed" : "failed",
    scenario: requested === "release" ? releaseScenario?.id : undefined,
    profile,
    provider,
    modelId: reportModelId === interviewModelId ? reportModelId : undefined,
    reportModelId,
    interviewModelId,
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
    candidateReport: reportBundle.report,
    turnComparisons: turns.map((turn) => ({
      index: turn.index,
      answer: turn.answer,
      expectedFieldIds: [...new Set((turn.expectedEvidence ?? []).flatMap((item) => item.reportFieldIds))].sort(),
      actualFieldIds: [...new Set(turn.edit.evidence.flatMap((item) => item.reportFieldIds))].sort(),
      expectedClaimIds: [...new Set((turn.expectedEvidence ?? []).flatMap((item) => item.claimIds))].sort(),
      actualClaimIds: [...new Set(turn.edit.evidence.flatMap((item) => item.claimIds))].sort(),
    })),
    scorecard,
    scorecardMarkdown: requested === "release" ? undefined : renderEvaluationScorecard(scorecard),
    telemetry: requested === "release" ? undefined : telemetry,
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
    telemetry: error instanceof ProfileEvaluationError ? error.telemetry : [],
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
