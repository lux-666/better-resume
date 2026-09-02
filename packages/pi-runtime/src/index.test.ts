import assert from "node:assert/strict";
import test from "node:test";
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import {
  activateInterview,
  applyInterviewDecision,
  createFixtureCandidate,
  createInterviewState,
  recordAnswer,
  startInterview,
} from "../../interview-core/src/index.ts";
import {
  buildInterviewAgentView,
  buildReportAgentView,
  decideNextStepWithAgent,
  editReportWithAgent,
  ModelProviderError,
  validateQuestionGeneration,
  validateReportEdit,
  withOneProviderRetry,
} from "./index.ts";

const reportEdit = (
  sourceQuote: string,
  polarity: "support" | "weakness" | "invalidate",
  answerDisposition: "substantive" | "vague" | "denial" | "contradiction" | "irrelevant" = "substantive",
) => ({
  answerDisposition,
  evidence: [{
    reportFieldIds: ["project_enterprise_rag:ownership"],
    claimIds: ["claim_rag_ownership"],
    competencyId: "software_engineering",
    statement: "候选人的回答提供了可审计信息。",
    polarity,
    strength: 0.7,
    specificity: 0.8,
    evaluatorConfidence: 0.75,
    sourceQuote,
  }],
});

const reportContext = (answer: string) => ({
  answer,
  claimIds: ["claim_rag_ownership"],
  fields: [{ id: "project_enterprise_rag:ownership", competencyId: "software_engineering" }],
});

test("accepts grounded report edits", () => {
  const cases = [
    ["我独立实现了召回模块。", "我独立实现了召回模块。", "support", "substantive"],
    ["记不太清具体分工。", "记不太清具体分工。", "weakness", "vague"],
    ["这个模块不是我做的。", "不是我做的", "invalidate", "denial"],
  ] as const;
  for (const [answer, quote, polarity, disposition] of cases) {
    assert.equal(validateReportEdit(reportEdit(quote, polarity, disposition), reportContext(answer))
      .evidence[0].sourceQuote, quote);
  }
  assert.deepEqual(validateReportEdit({ answerDisposition: "irrelevant", evidence: [] }, reportContext("无关回答")), {
    answerDisposition: "irrelevant", evidence: [],
  });
});

test("rejects ungrounded or out-of-report edits", () => {
  const context = reportContext("我独立实现了召回模块。");
  const invalid = [
    reportEdit("团队实现了生成模块。", "support"),
    { ...reportEdit(context.answer, "support"), evidence: [{
      ...reportEdit(context.answer, "support").evidence[0], reportFieldIds: ["invented"],
    }] },
    { ...reportEdit(context.answer, "support"), evidence: [{
      ...reportEdit(context.answer, "support").evidence[0], claimIds: ["invented"],
    }] },
    reportEdit(context.answer, "support", "vague"),
    reportEdit(context.answer, "weakness", "denial"),
  ];
  for (const value of invalid) assert.throws(() => validateReportEdit(value, context));
});

test("Report Agent view contains only the active project", () => {
  const state = createInterviewState("session", "role", createFixtureCandidate("Candidate"));
  startInterview(state);
  const serialized = JSON.stringify(buildReportAgentView(state));
  assert.match(serialized, /project_enterprise_rag/);
  assert.doesNotMatch(serialized, /project_service_agent/);
  assert.doesNotMatch(serialized, /claim_agent_ownership/);
});

test("Interview Agent view uses a compact portfolio index without evidence quotes", () => {
  const state = createInterviewState("session", "role", createFixtureCandidate("Candidate"));
  startInterview(state);
  recordAnswer(state, "我独立实现了召回模块。", reportEdit("我独立实现了召回模块。", "support").evidence);
  const view = buildInterviewAgentView(state) as {
    focusedProject: { id: string };
    projectIndex: { id: string }[];
  };
  const serialized = JSON.stringify(view);
  assert.equal(view.focusedProject.id, "project_enterprise_rag");
  assert.deepEqual(view.projectIndex.map(({ id }) => id), ["project_enterprise_rag", "project_service_agent"]);
  assert.doesNotMatch(serialized, /sourceQuote/);
  assert.doesNotMatch(serialized, /我独立实现了召回模块/);
});

test("Report Agent reads before submitting a grounded edit", async () => {
  const state = createInterviewState("session", "role", createFixtureCandidate("Candidate"));
  startInterview(state);
  const answer = "我独立实现了召回模块。";
  const edit = reportEdit(answer, "support");
  const faux = fauxProvider();
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("read_report", {}), { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxToolCall("edit_report", edit), { stopReason: "toolUse" }),
  ]);
  const models = createModels();
  models.setProvider(faux.provider);
  assert.deepEqual(await editReportWithAgent({
    model: faux.getModel(), streamFn: models.streamSimple.bind(models), state, answer,
  }), edit);
  assert.equal(faux.state.callCount, 2);
});

test("Report Agent repairs denial evidence that omits the denied claim", async () => {
  const state = createInterviewState("session", "role", createFixtureCandidate("Candidate"));
  startInterview(state);
  const answer = "这个模块不是我做的。";
  const invalid = reportEdit(answer, "invalidate", "denial");
  invalid.evidence[0].claimIds = [];
  const corrected = reportEdit(answer, "invalidate", "denial");
  const faux = fauxProvider();
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("read_report", {}), { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxToolCall("edit_report", invalid), { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxToolCall("edit_report", corrected), { stopReason: "toolUse" }),
  ]);
  const models = createModels();
  models.setProvider(faux.provider);
  assert.deepEqual(await editReportWithAgent({
    model: faux.getModel(), streamFn: models.streamSimple.bind(models), state, answer,
  }), corrected);
  assert.equal(faux.state.callCount, 3);
});

test("Report Agent receives active-project field constraints after an incompatible edit", async () => {
  const state = createInterviewState("session", "role", createFixtureCandidate("Candidate"));
  startInterview(state);
  const answer = "我独立实现了召回模块。";
  const invalid = reportEdit(answer, "support");
  invalid.evidence[0].reportFieldIds = ["project_service_agent:ownership"];
  const corrected = reportEdit(answer, "support");
  const faux = fauxProvider();
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("read_report", {}), { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxToolCall("edit_report", invalid), { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxToolCall("edit_report", corrected), { stopReason: "toolUse" }),
  ]);
  const models = createModels();
  models.setProvider(faux.provider);
  assert.deepEqual(await editReportWithAgent({
    model: faux.getModel(), streamFn: models.streamSimple.bind(models), state, answer,
  }), corrected);
  assert.equal(faux.state.callCount, 3);
});

test("Interview Agent reads the report and chooses the question itself", async () => {
  const state = createInterviewState("session", "role", createFixtureCandidate("Candidate"));
  activateInterview(state);
  const ask = {
    targetFieldId: "project_enterprise_rag:mechanism",
    reason: "The retrieval architecture is the highest-value unknown.",
    acknowledgement: "先看一下检索链路？",
    question: "稀疏召回和稠密召回具体是怎么融合的。",
  };
  const faux = fauxProvider();
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("read_report", {}), { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxToolCall("ask_candidate", ask), { stopReason: "toolUse" }),
  ]);
  const models = createModels();
  models.setProvider(faux.provider);
  assert.deepEqual(await decideNextStepWithAgent({
    model: faux.getModel(), streamFn: models.streamSimple.bind(models), state,
  }), {
    action: "ASK_CANDIDATE",
    targetFieldId: ask.targetFieldId,
    reason: ask.reason,
    question: "稀疏召回和稠密召回具体是怎么融合的？",
  });
});

test("finish_interview returns deterministic blockers and lets the Agent ask instead", async () => {
  const state = createInterviewState("session", "role", createFixtureCandidate("Candidate"));
  activateInterview(state);
  const ask = {
    targetFieldId: "project_enterprise_rag:ownership",
    reason: "Ownership is still missing.",
    question: "这个项目中哪项工作是你本人完成的？",
  };
  const faux = fauxProvider();
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("read_report", {}), { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxToolCall("finish_interview", { reason: "Done." }), { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxToolCall("ask_candidate", ask), { stopReason: "toolUse" }),
  ]);
  const models = createModels();
  models.setProvider(faux.provider);
  const rejected: string[][] = [];
  assert.deepEqual(await decideNextStepWithAgent({
    model: faux.getModel(), streamFn: models.streamSimple.bind(models), state,
    onFinishRejected: (blockers) => rejected.push([...blockers]),
  }), { action: "ASK_CANDIDATE", ...ask });
  assert.equal(faux.state.callCount, 3);
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0].length > 0);
});

test("Interview Agent cannot keep pursuing a field after two repeated answers", async () => {
  const state = createInterviewState("session", "role", createFixtureCandidate("Candidate"));
  activateInterview(state);
  const saturatedFieldId = state.report.fields[0].id;
  for (const index of [1, 2]) {
    applyInterviewDecision(state, {
      action: "ASK_CANDIDATE",
      targetFieldId: saturatedFieldId,
      reason: "Investigate ownership.",
      question: `请说明你的个人职责，追问 ${index}？`,
    });
    recordAnswer(state, "具体细节记不清了。", [], "vague");
  }
  const ask = {
    targetFieldId: state.report.fields[1].id,
    reason: "The previous field is saturated.",
    question: "请说明项目的关键技术机制？",
  };
  const faux = fauxProvider();
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("read_report", {}), { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxToolCall("ask_candidate", { ...ask, targetFieldId: saturatedFieldId }), {
      stopReason: "toolUse",
    }),
    fauxAssistantMessage(fauxToolCall("ask_candidate", ask), { stopReason: "toolUse" }),
  ]);
  const models = createModels();
  models.setProvider(faux.provider);
  assert.deepEqual(await decideNextStepWithAgent({
    model: faux.getModel(), streamFn: models.streamSimple.bind(models), state,
  }), { action: "ASK_CANDIDATE", ...ask });
});

test("question guard rejects fake warmth and multiple questions", () => {
  assert.deepEqual(validateQuestionGeneration({
    acknowledgement: "明白，你负责的是召回部分。",
    question: "当时你为什么选择这种召回方案？",
  }), {
    acknowledgement: "明白，你负责的是召回部分。",
    question: "当时你为什么选择这种召回方案？",
  });
  for (const value of [
    { acknowledgement: "很好，这证明你很优秀。", question: "接下来做了什么？" },
    { question: "你负责什么？效果如何？" },
    { question: "为了提高评分，你能补充证据缺口吗？" },
  ]) assert.throws(() => validateQuestionGeneration(value));
});

test("core still rejects an invalid Agent question", () => {
  const state = createInterviewState("session", "role", createFixtureCandidate("Candidate"));
  activateInterview(state);
  assert.throws(() => applyInterviewDecision(state, {
    action: "ASK_CANDIDATE",
    targetFieldId: state.report.fields[0].id,
    reason: "Invalid compound question.",
    question: "你做了什么？效果如何？",
  }));
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
