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
  buildCandidateFromIntake,
  buildInterviewRole,
  createFixtureCandidate,
  createInterviewState,
  normalizeInterviewIntake,
  recordAnswer,
  startInterview,
} from "../../interview-core/src/index.ts";
import {
  buildInterviewAgentView,
  buildReportAgentView,
  decideNextStepWithAgent,
  editReportWithAgent,
  ModelProviderError,
  TelemetryCollector,
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

test("production Agent views use only the current candidate and job context", () => {
  const intake = normalizeInterviewIntake({
    candidate: {
      name: "周遥",
      skills: ["用户研究", "活动策划"],
      projects: [{ name: "社区增长活动", description: "我负责访谈用户并设计活动流程。" }],
    },
    job: {
      title: "用户运营",
      introduction: "负责社区用户增长。",
      responsibilities: "策划活动并分析用户反馈。",
      requirements: "具备用户研究和活动执行经验。",
    },
  });
  const role = buildInterviewRole({ job: intake.job });
  const state = createInterviewState("current-context", role, buildCandidateFromIntake(intake, role), intake);
  startInterview(state);
  const serialized = JSON.stringify({
    report: buildReportAgentView(state),
    interview: buildInterviewAgentView(state),
  });

  assert.match(serialized, /用户研究/);
  assert.match(serialized, /用户运营/);
  assert.match(serialized, /社区增长活动/);
  assert.doesNotMatch(serialized, /周遥/);
  assert.doesNotMatch(serialized, /企业 RAG|客服 Agent|AI \/ LLM 应用工程师/);
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

test("telemetry records every model request and tool call without storing context content", async () => {
  const state = createInterviewState("telemetry-session", "role", createFixtureCandidate("Candidate"));
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
  const telemetry = new TelemetryCollector({ sessionId: state.sessionId, commandId: "command" });
  await editReportWithAgent({
    model: faux.getModel(), streamFn: models.streamSimple.bind(models), state, answer, telemetry,
  });
  const modelSpans = telemetry.trace.spans.filter((span) => span.kind === "model");
  const toolSpans = telemetry.trace.spans.filter((span) => span.kind === "tool");
  assert.equal(modelSpans.length, 2);
  assert.deepEqual(toolSpans.map((span) => span.toolName), ["read_report", "edit_report"]);
  assert.ok(modelSpans.every((span) => span.context?.fingerprint.length === 64));
  assert.doesNotMatch(JSON.stringify(telemetry.trace), /我独立实现了召回模块/);
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

test("Interview Agent moves to another project after two unproductive answers", async () => {
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
    targetFieldId: state.report.fields[4].id,
    reason: "The previous project reached a candidate boundary.",
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
  assert.deepEqual(validateQuestionGeneration({
    question: "你用哪个具体指标判断执行结果是否符合预期？",
  }), {
    question: "你用哪个具体指标判断执行结果是否符合预期？",
  });
  for (const value of [
    { acknowledgement: "很好，这证明你很优秀。", question: "接下来做了什么？" },
    { question: "你负责什么？效果如何？" },
    { question: "你的负责范围是什么、做了哪些关键决定，以及最终交付了什么？" },
    { question: "为了提高评分，你能补充证据缺口吗？" },
    { question: "你用哪些输入判断边界，为什么这样选择？" },
    { question: "请说明划分规则，并且给出性能结果？" },
    { question: "为了补齐评估字段，你做了什么？" },
  ]) assert.throws(() => validateQuestionGeneration(value));
});

test("question guard accepts nested decisions and technical terminology without confusing them with evaluation bookkeeping", () => {
  for (const question of [
    "你是怎么判断哪些输入需要独立处理的？",
    "你如何决定哪个环节要拆成独立节点？",
    "你用哪个指标判断执行结果是否符合预期？",
    "节点输出中有哪些字段？",
    "你如何标记已经完成的任务？",
    "这个节点如何处理输入以及输出之间的依赖？",
    "自动评测系统的评分规则是怎么实现的？",
    "你如何归档执行日志？",
    "请挑一次工具执行失败或流程被中断的经历，说说你当时是靠什么信息定位到出问题的是哪个环节的？",
  ]) assert.deepEqual(validateQuestionGeneration({ question }), { question });
});

test("Interview Agent accepts a focused engineering question and Core applies the same validation", async () => {
  const state = createInterviewState("session", "role", createFixtureCandidate("Candidate"));
  state.phaseVersion = 3;
  activateInterview(state);
  const ask = { targetFieldId: state.report.fields[0].id, targetDepth: 3, reason: "Investigate the input boundary.", question: "你是怎么判断哪些输入字段需要独立处理的？" };
  const faux = fauxProvider(); const models = createModels(); models.setProvider(faux.provider);
  faux.setResponses([
    (context) => {
      const schema = context.tools!.find((tool) => tool.name === "ask_candidate")!.parameters;
      assert.match(JSON.stringify(schema), /Required integer/);
      return fauxAssistantMessage(fauxToolCall("read_report", {}), { stopReason: "toolUse" });
    },
    fauxAssistantMessage(fauxToolCall("ask_candidate", ask), { stopReason: "toolUse" }),
  ]);
  const decision = await decideNextStepWithAgent({ model: faux.getModel(), streamFn: models.streamSimple.bind(models), state });
  applyInterviewDecision(state, decision);
  assert.equal(state.currentQuestion, ask.question);
  assert.equal(faux.state.callCount, 2);
});

test("Interview Agent receives specific correction instructions for a rejected question", async () => {
  const state = createInterviewState("session", "role", createFixtureCandidate("Candidate"));
  activateInterview(state);
  const ask = { targetFieldId: state.report.fields[0].id, reason: "Investigate ownership.", question: "你负责哪些工作？" };
  const faux = fauxProvider(); const models = createModels(); models.setProvider(faux.provider);
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("read_report", {}), { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxToolCall("ask_candidate", { ...ask, question: "你负责什么，效果如何？" }), { stopReason: "toolUse" }),
    (context) => {
      assert.match(JSON.stringify(context.messages.at(-1)), /Rewrite to request only one method, reason, or result/);
      return fauxAssistantMessage(fauxToolCall("ask_candidate", ask), { stopReason: "toolUse" });
    },
  ]);
  const decision = await decideNextStepWithAgent({ model: faux.getModel(), streamFn: models.streamSimple.bind(models), state });
  assert.equal(decision.question, ask.question);
});

test("Interview Agent can repair punctuation then focus, but stops after three rejected proposals", async () => {
  for (const repairsSuccessfully of [true, false]) {
    const state = createInterviewState("session", "role", createFixtureCandidate("Candidate"));
    activateInterview(state);
    const ask = { targetFieldId: state.report.fields[0].id, reason: "Ask about one incident.", question: "请选一次任务中断的经历，说说你当时怎么定位出错环节的？" };
    const faux = fauxProvider(); const models = createModels(); models.setProvider(faux.provider);
    const propose = (question: string) => fauxAssistantMessage(fauxToolCall("ask_candidate", { ...ask, question }), { stopReason: "toolUse" });
    const twoRequests = "有没有哪一次任务失败过，当时你是怎么判断问题出在哪一步的？";
    faux.setResponses([
      fauxAssistantMessage(fauxToolCall("read_report", {}), { stopReason: "toolUse" }),
      propose("有没有哪一次任务失败过？当时你是怎么判断问题出在哪一步的？"),
      propose(twoRequests),
      propose(repairsSuccessfully ? ask.question : twoRequests),
      propose(ask.question),
    ]);
    const operation = decideNextStepWithAgent({ model: faux.getModel(), streamFn: models.streamSimple.bind(models), state });
    if (repairsSuccessfully) assert.equal((await operation).question, ask.question);
    else await assert.rejects(operation, /exactly one fact/);
    assert.equal(faux.state.callCount, 4);
  }
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

test("Interview Agent repairs a premature project switch using current-project blockers", async () => {
  const state = createInterviewState("switch", "role", createFixtureCandidate());
  startInterview(state); recordAnswer(state, "我完成了模块实现");
  const current = state.turns[0].projectId;
  const next = state.report.fields.find((field) => field.projectId !== current)!;
  const measurement = state.report.fields.find((field) => field.projectId === current && field.id.endsWith(":measurement"))!;
  const question = { targetFieldId: measurement.id, question: "你用什么依据确认结果？", reason: "Verify the outcome before leaving." };
  const faux = fauxProvider(); const models = createModels(); models.setProvider(faux.provider);
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("read_report", {}), { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxToolCall("ask_candidate", { ...question, targetFieldId: next.id }), { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxToolCall("ask_candidate", question), { stopReason: "toolUse" }),
  ]);
  const telemetry = new TelemetryCollector();
  const decision = await decideNextStepWithAgent({ model: faux.getModel(), streamFn: models.streamSimple.bind(models), state, telemetry });
  assert.equal(decision.targetFieldId, measurement.id);
  assert.ok(telemetry.trace.spans.some((span) => span.outcome === "rejected"));
  assert.doesNotThrow(() => applyInterviewDecision(state, decision));
});
