import assert from "node:assert/strict";
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
  fixedProfiles,
  type FixedProfileName,
} from "../../../packages/interview-core/src/fixed-profiles.ts";
import {
  decideNextStepWithAgent,
  editReportWithAgent,
  withOneProviderRetry,
} from "../../../packages/pi-runtime/src/index.ts";
import { createModelRuntime } from "./model-runtime.ts";

const requested = process.argv[2] ?? "strong";
if (requested === "--help") {
  console.log("Usage: npm run eval:model -- strong|weak|contradictory|all");
  process.exit(0);
}
const { provider, modelId, model, streamFn } = createModelRuntime();
if (!provider || !modelId || !model || !streamFn) throw new Error("LLM configuration is required");
const configuredModel = model;
const configuredStreamFn = streamFn;
const profiles = requested === "all"
  ? Object.keys(fixedProfiles) as FixedProfileName[]
  : [requested as FixedProfileName];
if (profiles.some((profile) => !(profile in fixedProfiles))) {
  throw new Error("Profile must be strong, weak, contradictory, or all");
}

async function askOrFinish(state: InterviewState, turnId?: string): Promise<void> {
  const decision = await withOneProviderRetry(() => decideNextStepWithAgent({
    model: configuredModel, streamFn: configuredStreamFn, state,
  }));
  applyInterviewDecision(state, decision, turnId);
}

for (const profile of profiles) {
  const state = createInterviewState(
    `model-eval-${profile}-${Date.now()}`,
    "llm_application_engineer",
    createFixtureCandidate(profile),
  );
  activateInterview(state);
  await askOrFinish(state);
  while (state.status === "active") {
    const { answer } = fixedProfileResponse(profile, state);
    const edit = await withOneProviderRetry(() => editReportWithAgent({
      model: configuredModel, streamFn: configuredStreamFn, state, answer,
    }));
    const record = recordAnswer(state, answer, edit.evidence, edit.answerDisposition);
    await askOrFinish(state, record.turn.id);
  }

  assert.ok(state.turns.length <= 15);
  assert.equal(new Set(state.turns.map((turn) => turn.question)).size, state.turns.length);
  assert.equal(state.report.status, "complete");
  for (const evidence of state.evidence) {
    const turn = state.turns.find((candidate) => candidate.id === evidence.turnId);
    assert.ok(turn?.answer.includes(evidence.sourceQuote));
  }
  console.log(JSON.stringify({
    profile,
    provider,
    modelId,
    turns: state.turns.length,
    questions: state.turns.map(({ acknowledgement, question }) => ({ acknowledgement, question })),
    report: state.report,
    evidence: state.evidence.map(({ reportFieldIds, polarity, statement, sourceQuote }) => ({
      reportFieldIds, polarity, statement, sourceQuote,
    })),
    actions: state.traces.map((trace) => trace.action),
  }));
}
