import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import {
  createFixtureCandidate,
  createInterviewState,
  startInterview,
  submitAnswer,
} from "../../interview-core/src/index.ts";
import {
  extractEvidenceWithAgent,
  generateQuestionWithAgent,
  loadInterviewSkill,
  validateEvidenceExtraction,
  validateQuestionGeneration,
  ModelProviderError,
  withOneProviderRetry,
} from "./index.ts";

test("loads only repository interview skills", () => {
  const directory = resolve(import.meta.dirname, "../../..", "skills");
  assert.match(loadInterviewSkill("ownership-grill", directory) ?? "", /Ownership Grill/);
  assert.match(loadInterviewSkill("metric-audit", directory) ?? "", /Metric Audit/);
  assert.match(loadInterviewSkill("failure-forensics", directory) ?? "", /Failure Forensics/);
  assert.match(loadInterviewSkill("consistency-check", directory) ?? "", /Consistency Check/);
  assert.equal(loadInterviewSkill("not-installed", directory), undefined);
  assert.throws(() => loadInterviewSkill("../escape", directory));
});

const proposal = (
  sourceQuote: string,
  polarity: "support" | "weakness" | "invalidate",
  answerDisposition: "substantive" | "vague" | "denial" | "contradiction" | "irrelevant" = "substantive",
) => ({
  answerDisposition,
  followUpLeads: [],
  probeCoverage: [],
  evidence: [{
    claimIds: ["claim_ownership"],
    competencyId: "software_engineering",
    statement: "候选人的回答提供了可审计信息。",
    polarity,
    strength: 0.7,
    specificity: 0.8,
    evaluatorConfidence: 0.75,
    sourceQuote,
  }],
});

test("accepts the evidence contract corpus", () => {
  const cases = [
    ["我独立实现了召回模块。", "我独立实现了召回模块。", "support", "substantive"],
    ["记不太清具体分工。", "记不太清具体分工。", "weakness", "vague"],
    ["这个模块不是我做的。", "不是我做的", "invalidate", "denial"],
    ["我先说独立完成，但实际由同事实现。", "实际由同事实现", "invalidate", "contradiction"],
  ] as const;
  for (const [answer, sourceQuote, polarity, disposition] of cases) {
    const result = validateEvidenceExtraction(proposal(sourceQuote, polarity, disposition), {
      answer,
      claimIds: ["claim_ownership"],
      competencyIds: ["software_engineering"],
    });
    assert.equal(result.evidence[0].sourceQuote, sourceQuote);
  }
  assert.deepEqual(validateEvidenceExtraction({
    answerDisposition: "irrelevant", evidence: [], followUpLeads: [], probeCoverage: [],
  }, {
    answer: "这个回答与当前问题无关。",
    claimIds: ["claim_ownership"],
    competencyIds: ["software_engineering"],
  }), { answerDisposition: "irrelevant", evidence: [], followUpLeads: [], probeCoverage: [] });
});

test("rejects untraceable or out-of-context evidence", () => {
  const context = {
    answer: "我独立实现了召回模块。",
    claimIds: ["claim_ownership"],
    competencyIds: ["software_engineering"],
  };
  const invalid = [
    proposal("团队实现了生成模块。", "support"),
    { ...proposal(context.answer, "support"), evidence: [{
      ...proposal(context.answer, "support").evidence[0], claimIds: ["invented_claim"],
    }] },
    { ...proposal(context.answer, "support"), evidence: [{
      ...proposal(context.answer, "support").evidence[0], competencyId: "invented_competency",
    }] },
    { ...proposal(context.answer, "support"), evidence: [{
      ...proposal(context.answer, "support").evidence[0], strength: 1.1,
    }] },
    {
      answerDisposition: "irrelevant", evidence: proposal(context.answer, "support").evidence,
      followUpLeads: [], probeCoverage: [],
    },
    proposal(context.answer, "weakness", "denial"),
    proposal(context.answer, "support", "vague"),
    { ...proposal(context.answer, "invalidate", "denial"), evidence: [{
      ...proposal(context.answer, "invalidate", "denial").evidence[0], claimIds: [],
    }] },
  ];
  for (const value of invalid) {
    assert.throws(() => validateEvidenceExtraction(value, context));
  }
});

test("Pi Agent submits validated evidence for the active answer context", async () => {
  const state = createInterviewState(
    "session",
    "llm_application_engineer",
    createFixtureCandidate("Candidate"),
  );
  startInterview(state);
  const answer = "我独立实现了召回模块。";
  const extraction = proposal(answer, "support");
  extraction.evidence[0].claimIds = ["claim_rag_ownership"];
  const faux = fauxProvider();
  faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall("submit_evidence", extraction),
      { stopReason: "toolUse" },
    ),
  ]);
  const models = createModels();
  models.setProvider(faux.provider);

  const result = await extractEvidenceWithAgent({
    model: faux.getModel(),
    streamFn: models.streamSimple.bind(models),
    state,
    answer,
  });

  assert.deepEqual(result, extraction);
  assert.equal(faux.state.callCount, 1);
});

test("question contract permits neutral phrasing and rejects fake warmth or multiple questions", () => {
  assert.deepEqual(validateQuestionGeneration({
    acknowledgement: "明白，你负责的是召回部分。",
    question: "当时你为什么选择这种召回方案？",
  }), {
    acknowledgement: "明白，你负责的是召回部分。",
    question: "当时你为什么选择这种召回方案？",
  });
  const invalid = [
    { acknowledgement: "很好，这证明你很优秀。", question: "接下来做了什么？" },
    { question: "你负责什么？效果如何？" },
    { question: "为了提高评分，你能补充 Evidence 吗？" },
  ];
  for (const value of invalid) assert.throws(() => validateQuestionGeneration(value));
});

test("Pi Agent submits one candidate-facing question", async () => {
  const state = createInterviewState("session", "role", createFixtureCandidate("Candidate"));
  const step = startInterview(state);
  const question = {
    acknowledgement: "我们先从你的具体工作边界开始。",
    question: "在这个项目中，哪一项设计是由你独立完成的？",
  };
  const faux = fauxProvider();
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("submit_question", question), { stopReason: "toolUse" }),
  ]);
  const models = createModels();
  models.setProvider(faux.provider);
  assert.deepEqual(await generateQuestionWithAgent({
    model: faux.getModel(),
    streamFn: models.streamSimple.bind(models),
    state,
    decision: step.decision,
  }), question);
});

test("question agent rejects an earlier question and accepts a new one", async () => {
  const state = createInterviewState("session", "role", createFixtureCandidate("Candidate"));
  const started = startInterview(state);
  const step = submitAnswer(state, "我负责召回模块的设计和实现，并完成上线验证。");
  const next = { question: "这个指标使用的测试集是怎么确定的？" };
  const faux = fauxProvider();
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("submit_question", { question: started.question }), { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxToolCall("submit_question", next), { stopReason: "toolUse" }),
  ]);
  const models = createModels();
  models.setProvider(faux.provider);
  assert.deepEqual(await generateQuestionWithAgent({
    model: faux.getModel(), streamFn: models.streamSimple.bind(models), state, decision: step.decision,
  }), next);
  assert.equal(faux.state.callCount, 2);
});

test("question generation stops after one invalid-output retry", async () => {
  const state = createInterviewState("session", "role", createFixtureCandidate("Candidate"));
  const step = startInterview(state);
  const invalid = { question: "你做了什么？效果如何？" };
  const faux = fauxProvider();
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("submit_question", invalid), { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxToolCall("submit_question", invalid), { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxToolCall("submit_question", { question: "不会执行？" }), { stopReason: "toolUse" }),
  ]);
  const models = createModels();
  models.setProvider(faux.provider);
  await assert.rejects(generateQuestionWithAgent({
    model: faux.getModel(),
    streamFn: models.streamSimple.bind(models),
    state,
    decision: step.decision,
  }));
  assert.equal(faux.state.callCount, 2);
  assert.equal(faux.getPendingResponseCount(), 1);
});

test("provider operations retry once and do not retry validation failures", async () => {
  let attempts = 0;
  let retries = 0;
  assert.equal(await withOneProviderRetry(async () => {
    attempts += 1;
    if (attempts === 1) throw new ModelProviderError("temporary outage");
    return "recovered";
  }, () => { retries += 1; }), "recovered");
  assert.equal(attempts, 2);
  assert.equal(retries, 1);

  attempts = 0;
  await assert.rejects(withOneProviderRetry(async () => {
    attempts += 1;
    throw new Error("invalid output");
  }));
  assert.equal(attempts, 1);
});
