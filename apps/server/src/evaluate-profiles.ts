import assert from "node:assert/strict";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import {
  createFixtureCandidate,
  createInterviewState,
  setGeneratedPrompt,
  startInterview,
  submitAnswer,
  type InterviewStep,
} from "../../../packages/interview-core/src/index.ts";
import {
  fixedProfileResponse,
  fixedProfiles,
  type FixedProfileName,
} from "../../../packages/interview-core/src/fixed-profiles.ts";
import {
  extractEvidenceWithAgent,
  generateQuestionWithAgent,
  loadInterviewSkill,
  withOneProviderRetry,
} from "../../../packages/pi-runtime/src/index.ts";

const requested = process.argv[2] ?? "strong";
if (requested === "--help") {
  console.log("Usage: npm run eval:model -- strong|weak|contradictory|all");
  process.exit(0);
}
const provider = process.env.PI_PROVIDER;
const modelId = process.env.PI_MODEL;
if (!provider || !modelId) throw new Error("PI_PROVIDER and PI_MODEL are required");
const models = builtinModels();
const model = models.getModel(provider, modelId);
if (!model) throw new Error(`Unknown Pi model: ${provider}/${modelId}`);
const profiles = requested === "all"
  ? Object.keys(fixedProfiles) as FixedProfileName[]
  : [requested as FixedProfileName];
if (profiles.some((profile) => !(profile in fixedProfiles))) {
  throw new Error("Profile must be strong, weak, contradictory, or all");
}

async function phraseQuestion(step: InterviewStep): Promise<void> {
  if (step.decision.action === "FINISH") return;
  const prompt = await withOneProviderRetry(() => generateQuestionWithAgent({
    model,
    streamFn: models.streamSimple.bind(models),
    state: step.state,
    decision: step.decision,
    skillInstruction: step.decision.skill ? loadInterviewSkill(step.decision.skill) : undefined,
  }));
  setGeneratedPrompt(step.state, prompt);
  step.question = prompt.question;
}

for (const profile of profiles) {
  const state = createInterviewState(
    `model-eval-${profile}-${Date.now()}`,
    "llm_application_engineer",
    createFixtureCandidate(profile),
  );
  let step = startInterview(state);
  await phraseQuestion(step);
  while (state.status === "active" && state.turns.length < 10) {
    const { answer } = fixedProfileResponse(profile, state);
    const extraction = await withOneProviderRetry(() => extractEvidenceWithAgent({
      model,
      streamFn: models.streamSimple.bind(models),
      state,
      answer,
    }));
    step = submitAnswer(state, answer, extraction.evidence, extraction.answerDisposition);
    await phraseQuestion(step);
  }

  assert.equal(state.status, "completed", `${profile} did not finish within 10 turns`);
  assert.ok(state.turns.length >= 6 && state.turns.length <= 10);
  assert.equal(new Set(state.turns.map((turn) => turn.question)).size, state.turns.length);
  for (const evidence of state.evidence) {
    const turn = state.turns.find((candidate) => candidate.id === evidence.turnId);
    assert.ok(turn?.answer.includes(evidence.sourceQuote));
  }
  const claims = state.candidate.projects.flatMap((project) => project.claims);
  if (profile === "strong") assert.ok(claims.every((claim) => claim.status === "supported"));
  if (profile === "weak") assert.ok(claims.every((claim) => claim.status === "weakened"));
  if (profile === "contradictory") {
    assert.equal(claims.filter((claim) => claim.status === "contradicted").length, 2);
  }
  console.log(JSON.stringify({
    profile,
    provider,
    modelId,
    turns: state.turns.length,
    questions: state.turns.map(({ acknowledgement, question }) => ({ acknowledgement, question })),
    evidence: state.evidence.map(({ competencyId, polarity, statement, sourceQuote }) => ({
      competencyId, polarity, statement, sourceQuote,
    })),
    actions: state.traces.map((trace) => trace.action),
    claimStatuses: Object.fromEntries(claims.map((claim) => [claim.id, claim.status])),
  }));
}
