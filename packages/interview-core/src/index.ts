import type { InterviewAction, Claim, Project, CandidateProfile, RoleCompetency, InterviewRole, CandidateProjectIntake, CandidateIntake, InterviewIntake, ReportFieldStatus, ReportField, ReportContradiction, CandidateReport, InterviewTurn, Evidence, EvidenceProposal, AnswerDisposition, CompetencyState, TaskExecutionTrace, StepExecutionTrace, DecisionTrace, InterviewProgress, InterviewState, InterviewDecision, InterviewStep, AnswerRecord, CompletionCheck, DepthLevel, LeadProposal, Lead, Clarification } from "./types.ts";
export type { InterviewAction, Claim, Project, CandidateProfile, RoleCompetency, InterviewRole, CandidateProjectIntake, CandidateIntake, InterviewIntake, ReportFieldStatus, ReportField, ReportContradiction, CandidateReport, InterviewTurn, Evidence, EvidenceProposal, AnswerDisposition, CompetencyState, TaskExecutionTrace, StepExecutionTrace, DecisionTrace, InterviewProgress, InterviewState, InterviewDecision, InterviewStep, AnswerRecord, CompletionCheck, DepthLevel, LeadProposal, Lead, Clarification } from "./types.ts";
import { fieldConclusion, projectLeads, groundedAnswerClaims, prepareLeads, answerTurnCount, interviewTurnLimit, interviewTimeBudgetExhausted, saturatedFieldIds, projectInvestigationBlockers, validateProjectSwitch } from "./investigation.ts";
export { fieldConclusion, projectLeads, groundedAnswerClaims, answerTurnCount, interviewTurnLimit, interviewTimeBudgetExhausted, saturatedFieldIds, projectInvestigationBlockers, validateProjectSwitch } from "./investigation.ts";
import { addCandidateTopic, recordDiscussion, demoOpenFloorReply } from "./open-floor.ts";
import { projectPauseReason } from "./investigation.ts";
export { addCandidateTopic, recordDiscussion, demoOpenFloorReply } from "./open-floor.ts";


const FIELD_KINDS = [
  {
    id: "ownership",
    name: "个人贡献与职责",
    importance: 1,
    competency: (project: Project) => project.mappedCompetencies.find((id) =>
      ["ownership_delivery", "software_engineering"].includes(id)
    ) ?? project.mappedCompetencies[0],
    description: (project: Project) => `明确候选人在“${project.name}”中的个人边界、决策和交付。`,
  },
  {
    id: "mechanism",
    name: "关键方法与选择依据",
    importance: 0.9,
    competency: (project: Project) => project.mappedCompetencies.find((id) =>
      id === "role_capability"
    ) ?? project.mappedCompetencies.find((id) =>
      !["ownership_delivery", "software_engineering", "evaluation", "problem_solving"].includes(id)
    ) ?? project.mappedCompetencies[0],
    description: (project: Project) => `说明“${project.name}”采用的关键方法或流程、选择依据和取舍。`,
  },
  {
    id: "measurement",
    name: "结果与验证",
    importance: 0.9,
    competency: (project: Project) => project.mappedCompetencies.includes("evaluation")
      ? "evaluation" : project.mappedCompetencies[0],
    description: (project: Project) => `说明“${project.name}”如何判断结果、使用了哪些数据或反馈，以及结论如何验证。`,
  },
  {
    id: "failure",
    name: "问题解决",
    importance: 0.8,
    competency: (project: Project) => project.mappedCompetencies.includes("problem_solving")
      ? "problem_solving" : project.mappedCompetencies[0],
    description: (project: Project) => `重建“${project.name}”中的一次问题或偏差、判断过程、处理方式和结果确认。`,
  },
] as const;

export function createCandidateReport(candidate: CandidateProfile): CandidateReport {
  return {
    objective: "完成一份可信、完整、且每个重要判断都有候选人原话支撑的 Candidate Report。",
    status: "in_progress",
    fields: candidate.projects.flatMap((project) => FIELD_KINDS.map((kind): ReportField => ({
      id: `${project.id}:${kind.id}`,
      projectId: project.id,
      competencyId: kind.competency(project),
      name: kind.name,
      description: kind.description(project),
      importance: kind.importance,
      status: "missing",
      evidenceIds: [],
    }))),
    contradictions: [],
  };
}

export function createInterviewState(
  sessionId: string,
  role: string | InterviewRole,
  candidate: CandidateProfile,
  intake?: InterviewIntake,
): InterviewState {
  const resolvedRole = typeof role === "string" ? createLegacyInterviewRole(role, candidate) : role;
  return {
    sessionId,
    roleId: resolvedRole.id,
    role: resolvedRole,
    intake: intake ?? {
      candidate: {
        name: candidate.name,
        skills: [...candidate.skills],
        projects: candidate.projects.map((project) => ({
          name: project.name,
          description: project.description,
        })),
      },
    },
    status: "draft",
    candidate,
    report: createCandidateReport(candidate),
    turns: [],
    evidence: [],
    competencies: [],
    traces: [],
  };
}

export function createLegacyInterviewRole(roleId: string, candidate: CandidateProfile): InterviewRole {
  const competencyIds = [...new Set(candidate.projects.flatMap((project) => project.mappedCompetencies))];
  return {
    id: roleId,
    name: roleId === "llm_application_engineer" ? "AI / LLM 应用工程师" : "通用候选人",
    source: "legacy_role",
    description: "由旧版 Session 兼容生成的岗位上下文。",
    requirements: [],
    competencies: competencyIds.map((id) => ({ id, name: id, weight: 1 / Math.max(1, competencyIds.length), core: true })),
  };
}

export function getInterviewProgress(
  state: InterviewState,
  coreCompetencyIds: readonly string[],
): InterviewProgress {
  const coveredFields = state.report.fields.filter((field) => field.status !== "missing").length;
  const coveredCoreCompetencies = coreCompetencyIds.filter((competencyId) => {
    const competency = state.competencies.find((item) => item.competencyId === competencyId);
    return competency !== undefined && competency.evidenceIds.length > 0 && competency.confidence >= 0.3;
  }).length;
  const coverageTotal = state.report.fields.length + coreCompetencyIds.length;
  return {
    stage: state.status === "draft" ? "not_started" : state.status === "completed" ? "completed" : "interviewing",
    coveragePercent: coverageTotal === 0 ? 0
      : Math.round((coveredFields + coveredCoreCompetencies) / coverageTotal * 100),
    turns: { completed: answerTurnCount(state), max: interviewTurnLimit(state) },
    projects: {
      covered: state.candidate.projects.filter((project) =>
        state.evidence.some((evidence) => evidence.projectId === project.id)
      ).length,
      total: state.candidate.projects.length,
    },
    reportFields: { covered: coveredFields, total: state.report.fields.length },
    coreCompetencies: { covered: coveredCoreCompetencies, total: coreCompetencyIds.length },
    contradictionsOpen: state.report.contradictions.filter((item) => item.status === "open").length,
  };
}

export function createFixtureCandidate(name = "匿名候选人"): CandidateProfile {
  const ragId = "project_enterprise_rag";
  const agentId = "project_service_agent";
  const claim = (
    id: string,
    text: string,
    projectId: string,
    relatedCompetencies: string[],
  ): Claim => ({
    id,
    source: "resume",
    text,
    projectId,
    status: "unverified",
    relatedCompetencies,
    supportingEvidenceIds: [],
    weakEvidenceIds: [],
    contradictingEvidenceIds: [],
  });
  const ragClaims = [
    claim("claim_rag_ownership", "负责企业 RAG 知识库的架构与实现", ragId,
      ["rag_engineering", "software_engineering"]),
    claim("claim_rag_metric", "回答准确率提高 15%", ragId, ["rag_engineering", "evaluation"]),
  ];
  const agentClaims = [
    claim("claim_agent_ownership", "主导客服 Agent 工作流的设计与落地", agentId,
      ["agent_engineering", "software_engineering"]),
    claim("claim_agent_metric", "平均响应延迟降低 30%", agentId, ["agent_engineering", "evaluation"]),
  ];
  return {
    id: globalThis.crypto.randomUUID(),
    name,
    education: [],
    experiences: [],
    skills: ["RAG", "Agent", "TypeScript"],
    claims: [],
    projects: [
      {
        id: ragId,
        name: "企业 RAG 知识库",
        description: "基于向量检索与 reranker 的企业知识问答系统",
        candidateRole: "AI / LLM 应用工程师",
        technologies: ["TypeScript", "BGE", "Milvus", "Reranker"],
        outcomes: ["回答准确率提高 15%"],
        claims: ragClaims,
        mappedCompetencies: ["rag_engineering", "software_engineering", "evaluation", "problem_solving"],
        roleRelevance: 1,
      },
      {
        id: agentId,
        name: "客服 Agent 工作流",
        description: "包含工具调用、状态管理和人工升级的客服 Agent",
        candidateRole: "AI / LLM 应用工程师",
        technologies: ["TypeScript", "Tool Calling", "State Machine"],
        outcomes: ["平均响应延迟降低 30%"],
        claims: agentClaims,
        mappedCompetencies: ["agent_engineering", "software_engineering", "evaluation", "problem_solving"],
        roleRelevance: 0.8,
      },
    ],
  };
}

export function selectAnchorProject(projects: Project[]): Project | undefined {
  return projects.toSorted((left, right) => projectValue(right) - projectValue(left))[0];
}

function projectValue(project: Project): number {
  return (project.roleRelevance ?? 0) * 0.4
    + Math.min(project.mappedCompetencies.length / 5, 1) * 0.3
    + Math.min(project.claims.length / 5, 1) * 0.2
    + Math.min(project.technologies.length / 8, 1) * 0.1;
}

export function activateInterview(state: InterviewState): void {
  if (state.status !== "draft") throw new Error("Interview has already started");
  if (state.candidate.projects.length === 0 || state.report.fields.length === 0) {
    throw new Error("Interview requires at least one report field");
  }
  state.status = "active";
}

export function getActiveInterviewContext(state: InterviewState): {
  project: Project;
  field: ReportField;
} {
  const fieldId = state.traces.at(-1)?.targetFieldId;
  const field = state.report.fields.find((item) => item.id === fieldId);
  const project = state.candidate.projects.find((item) => item.id === field?.projectId);
  if (!project || !field) throw new Error("Active interview context is incomplete");
  return { project, field };
}

export function recordAnswer(
  state: InterviewState,
  answer: string,
  proposedEvidence?: readonly EvidenceProposal[],
  disposition: AnswerDisposition = "substantive",
  leadProposals: readonly LeadProposal[] = [],
  supplementProjectId?: string,
  answerProjectId?: string,
): AnswerRecord {
  if (supplementProjectId ? state.status !== "completed" || state.turns.some((turn) => turn.kind === "supplement") : state.status !== "active" || !state.currentQuestion) throw new Error("Interview is not awaiting an answer");
  const text = answer.trim();
  if (!text) throw new Error("Answer cannot be empty");
  const projectId = supplementProjectId ?? answerProjectId;
  const context = projectId ? {
    project: state.candidate.projects.find((project) => project.id === projectId),
    field: state.report.fields.find((field) => field.projectId === projectId),
  } : getActiveInterviewContext(state);
  const { project, field } = context;
  if (!project || !field) throw new Error("Unknown project");
  const turn: InterviewTurn = {
    id: globalThis.crypto.randomUUID(),
    index: state.turns.length,
    projectId: project.id,
    reportFieldId: supplementProjectId ? undefined : field.id,
    kind: supplementProjectId ? "supplement" : "answer",
    disposition,
    targetDepth: state.traces.at(-1)?.targetDepth,
    acknowledgement: state.currentAcknowledgement,
    question: supplementProjectId ? "请补充与该项目相关的具体事实。" : state.currentQuestion!,
    answer: text,
    timestamp: new Date().toISOString(),
  };

  const proposals = proposedEvidence ?? [extractDemoEvidence(text, project, field)];
  if ((disposition === "irrelevant" || disposition === "question_back") && proposals.length > 0) {
    throw new Error("Irrelevant answers cannot produce evidence");
  }
  const answerClaims = groundedAnswerClaims(state, project.id);
  const knownClaimIds = new Set([...project.claims, ...state.candidate.claims, ...answerClaims]
    .filter((claim) => !claim.projectId || claim.projectId === project.id)
    .map((claim) => claim.id));
  const evidence = proposals.map((proposal): Evidence => {
    if (proposal.depthLevel !== undefined && (!Number.isInteger(proposal.depthLevel) || proposal.depthLevel < 1 || proposal.depthLevel > 5)) throw new Error("Invalid evidence depth");
    if ((disposition === "vague" || disposition === "skip_request") && proposal.polarity !== "weakness") throw new Error("Vague/skip answers only provide weakness");
    if (!proposal.sourceQuote || !text.includes(proposal.sourceQuote)) {
      throw new Error("Evidence sourceQuote must be verbatim from the answer");
    }
    const fields = proposal.reportFieldIds.map((id) => state.report.fields.find((item) => item.id === id));
    if (fields.length === 0 || fields.some((item) =>
      !item || item.projectId !== project.id || item.competencyId !== proposal.competencyId
    )) {
      throw new Error("Evidence must reference compatible report fields in the active project");
    }
    if (proposal.claimIds.some((id) => !knownClaimIds.has(id))) throw new Error("Evidence references an unknown claim");
    return {
      ...proposal,
      id: globalThis.crypto.randomUUID(),
      turnId: turn.id,
      projectId: project.id,
    };
  });
  const leads = prepareLeads(state, leadProposals, turn);
  for (const claim of answerClaims) if (evidence.some((item) => item.claimIds.includes(claim.id)) && !state.candidate.claims.some((item) => item.id === claim.id)) state.candidate.claims.push(claim);
  state.leads = [...(state.leads ?? []), ...leads];
  state.turns.push(turn);
  state.evidence.push(...evidence);
  for (const item of evidence) {
    updateClaims(state, project, item);
    updateReport(state, item);
  }
  updateContradictions(state, evidence);
  for (const competencyId of new Set(evidence.map((item) => item.competencyId))) {
    updateCompetency(state, competencyId);
  }
  state.currentAcknowledgement = undefined;
  state.currentTransition = undefined;
  state.currentClarification = undefined;
  state.currentQuestion = undefined;
  return { state, turn, evidence };
}

function updateReport(state: InterviewState, evidence: Evidence): void {
  for (const id of evidence.reportFieldIds) {
    const field = state.report.fields.find((item) => item.id === id);
    if (!field) continue;
    if (field.competencyId !== evidence.competencyId) {
      throw new Error("Evidence competency does not match its report field");
    }
    field.evidenceIds.push(evidence.id);
    const conclusion = fieldConclusion(state, id);
    field.summary = [...conclusion.supportStatements, ...conclusion.weaknessStatements, ...conclusion.invalidateStatements].join("；");
    field.status = evidence.polarity === "invalidate" ? "contradicted"
      : evidence.polarity === "support" && evidence.strength * evidence.specificity >= 0.45
        ? "supported" : "weak";
  }
}

function updateContradictions(state: InterviewState, evidence: readonly Evidence[]): void {
  const openedInThisAnswer = new Set<string>();
  for (const item of evidence) {
    for (const claimId of item.claimIds) {
      const existing = state.report.contradictions.find((entry) => entry.claimId === claimId);
      if (existing && openedInThisAnswer.has(claimId)) {
        existing.evidenceIds.push(item.id);
        continue;
      }
      if (item.polarity === "invalidate") {
        if (existing) {
          if (existing.status === "open") {
            existing.status = "resolved";
          }
          existing.resolutionEvidenceIds.push(item.id);
        } else {
          const claim = allClaims(state).find((candidate) => candidate.id === claimId);
          state.report.contradictions.push({
            id: `contradiction:${claimId}`,
            kind: claim?.sourceEvidenceId ? "cross_project" : "claim",
            claimId,
            projectId: claim?.projectId,
            status: "open",
            evidenceIds: [item.id],
            resolutionEvidenceIds: [],
          });
          openedInThisAnswer.add(claimId);
        }
      } else if (existing?.status === "open") {
        existing.status = "resolved";
        existing.resolutionEvidenceIds.push(item.id);
      }
    }
  }
}

function allClaims(state: InterviewState): Claim[] {
  return [...state.candidate.claims, ...state.candidate.projects.flatMap((project) => project.claims)];
}

function updateClaims(state: InterviewState, project: Project, evidence: Evidence): void {
  const claims = [...project.claims, ...state.candidate.claims].filter((claim) =>
    evidence.claimIds.includes(claim.id)
  );
  for (const claim of claims) {
    if (evidence.polarity === "support") claim.supportingEvidenceIds.push(evidence.id);
    else if (evidence.polarity === "weakness") claim.weakEvidenceIds.push(evidence.id);
    else claim.contradictingEvidenceIds.push(evidence.id);
    claim.status = claim.contradictingEvidenceIds.length > 0 ? "contradicted"
      : claim.supportingEvidenceIds.length > 0 ? "supported" : "weakened";
  }
}

function updateCompetency(state: InterviewState, competencyId: string): void {
  const evidence = state.evidence.filter((item) => item.competencyId === competencyId);
  const score = Math.round(evidence.reduce((sum, item) => {
    const quality = item.strength * item.specificity;
    return sum + (item.polarity === "support" ? 50 + quality * 50 : 50 - quality * 50);
  }, 0) / evidence.length);
  const confidence = Math.min(0.95, evidence.reduce(
    (sum, item) => sum + item.evaluatorConfidence * item.specificity,
    0,
  ) / evidence.length);
  const current = state.competencies.find((item) => item.competencyId === competencyId);
  const next: CompetencyState = {
    competencyId,
    score,
    confidence,
    evidenceIds: evidence.map((item) => item.id),
    missingEvidence: state.report.fields
      .filter((field) => field.competencyId === competencyId && field.status === "missing")
      .map((field) => field.description),
    contradictoryEvidence: evidence.filter((item) => item.polarity === "invalidate").map((item) => item.id),
  };
  if (current) Object.assign(current, next);
  else state.competencies.push(next);
}

export function validateCompletion(state: InterviewState): CompletionCheck {
  if (answerTurnCount(state) >= interviewTurnLimit(state)) return { allowed: true, forced: true, blockers: [], blockerCodes: [] };
  const saturated = new Set(saturatedFieldIds(state));
  const paused = new Set(state.candidate.projects.filter((project) => projectPauseReason(state, project.id)).map((project) => project.id));
  const blockers = state.report.fields
    .filter((field) => field.importance >= 0.8 && field.status === "missing" && !saturated.has(field.id) && !paused.has(field.projectId))
    .map((field) => `${field.id}: ${field.description}`);
  const blockerCodes = blockers.map(() => "required_field_missing");
  for (const project of state.candidate.projects) {
    if (paused.has(project.id)) continue;
    if (!state.report.fields.some((field) => field.projectId === project.id && field.evidenceIds.length > 0) && state.report.fields.some((field) => field.projectId === project.id && !saturated.has(field.id))) {
      blockers.push(`${project.id}: core project has no candidate evidence`);
      blockerCodes.push("project_evidence_missing");
    }
  }
  if (state.phaseVersion === 3) {
    for (const project of state.candidate.projects) {
      if (paused.has(project.id)) continue;
      const explored = state.report.fields.filter((field) => field.projectId === project.id).map((field) => fieldConclusion(state, field.id));
      if (!explored.some((field) => (field.reachedDepth ?? 0) >= 3) && state.report.fields.some((field) => field.projectId === project.id && !saturated.has(field.id))) {
        blockers.push(`${project.id}: depth or grounded boundary required`);
        blockerCodes.push("depth_or_boundary_missing");
      }
    }
  }
  for (const contradiction of state.report.contradictions.filter((item) => item.status === "open")) {
    if (contradiction.projectId && paused.has(contradiction.projectId)) continue;
    blockers.push(`${contradiction.id}: unresolved contradiction`);
    blockerCodes.push("contradiction_unresolved");
  }
  for (const evidence of state.evidence) {
    const turn = state.turns.find((item) => item.id === evidence.turnId);
    if (!turn?.answer.includes(evidence.sourceQuote)) {
      blockers.push(`${evidence.id}: ungrounded evidence`);
      blockerCodes.push("evidence_ungrounded");
    }
  }
  return { allowed: blockers.length === 0, forced: false, blockers, blockerCodes };
}

export function validateCandidateQuestion(question: string, acknowledgement?: string): void {
  if (question !== question.trim() || acknowledgement !== acknowledgement?.trim()) {
    throw new Error("Question output must not contain surrounding whitespace");
  }
  const marks = question.match(/[?？]/g)?.length ?? 0;
  if (marks !== 1 || !/[?？]$/.test(question)) {
    throw new Error("Question output must contain exactly one final question mark");
  }
  const requestedFacts = question.replace(/(?:判断|验证|确认|评估)[^?？]*是否/g, "")
    .match(/为什么|如何|怎么|哪些|什么|多少|是否|哪(?:个|些|项|种|一)/g) ?? [];
  if (requestedFacts.length > 1 || /以及|并且|分别/.test(question)) {
    throw new Error("Question output must request exactly one fact");
  }
  const output = `${acknowledgement ?? ""}\n${question}`;
  if (/rubric|policy|target.?gap|probe|评分|得分|证据|字段|维度|report|evidence|能力模型|记录为|按.{0,8}处理|暂按|标记|归档/i.test(output)) {
    throw new Error("Question output reveals internal evaluation context");
  }
  if (/非常棒|很棒|很好|优秀|厉害|显然|这证明|由此可见|你确实|不错|可以看出/.test(output)) {
    throw new Error("Question output contains evaluative praise or presupposition");
  }
  if (/[?？]/.test(acknowledgement ?? "")) throw new Error("Acknowledgement cannot contain a question");
}

export function applyInterviewDecision(
  state: InterviewState,
  decision: InterviewDecision,
  turnId?: string,
): InterviewStep {
  if (state.status !== "active") throw new Error("Interview is not active");
  if (decision.action === "CLARIFY_QUESTION") {
    if (!state.currentQuestion || !decision.clarification) throw new Error("Clarification requires an active question");
    validateCandidateAside(decision.clarification);
    state.currentClarification = decision.clarification;
    state.traces.push({ ...decision, generatedQuestion: state.currentQuestion });
    return { state, decision, question: state.currentQuestion, evidence: [] };
  }
  const completion = validateCompletion(state);
  if (decision.action === "CANDIDATE_FINISH" && !state.openFloor) throw new Error("Candidate closing requires an open invitation");
  const effective: InterviewDecision = completion.forced
    ? { action: "FINISH_INTERVIEW", reason: "Configured turn limit reached." }
    : decision.action === "FINISH_INTERVIEW" && completion.allowed
      ? { action: "INVITE_CANDIDATE", reason: "Invite unasked strengths or candidate questions before closing.",
        question: "还有什么你希望补充或向我了解的内容？", acknowledgement: "可以聊聊简历之外的拿手经历，也可以向我提问；没有想补充的可以直接结束。" }
      : decision;
  if (effective.action === "FINISH_INTERVIEW" || effective.action === "CANDIDATE_FINISH") {
    if (!completion.allowed && effective.action !== "CANDIDATE_FINISH") throw new Error(`Candidate Report is incomplete: ${completion.blockers.join("; ")}`);
    state.status = "completed";
    state.report.status = "complete";
    state.currentAcknowledgement = undefined;
    state.currentQuestion = undefined;
    state.openFloor = false;
  } else if (effective.action === "INVITE_CANDIDATE") {
    if (!completion.allowed) throw new Error("Resolve investigation blockers before inviting open discussion");
    state.openFloor = true;
    state.currentQuestion = effective.question;
    state.currentAcknowledgement = effective.acknowledgement;
    state.currentClarification = undefined;
    state.currentTransition = undefined;
  } else {
    const field = state.report.fields.find((item) => item.id === effective.targetFieldId);
    if (!field || !effective.question) throw new Error("ask_candidate requires a known report field and question");
    validateProjectSwitch(state, field.id);
    validateCandidateQuestion(effective.question, effective.acknowledgement);
    if (effective.transition) validateCandidateAside(effective.transition);
    if (effective.targetDepth !== undefined && (!Number.isInteger(effective.targetDepth) || effective.targetDepth < 1 || effective.targetDepth > 5)) throw new Error("Invalid target depth");
    if (state.turns.some((turn) => turn.reportFieldId === field.id && turn.disposition === "skip_request")) throw new Error("Candidate skipped this field");
    if (effective.followsLeadId) {
      const lead = projectLeads(state).find((item) => item.id === effective.followsLeadId);
      if (!lead || lead.status !== "open" || lead.projectId !== field.projectId) throw new Error("Lead must be open and belong to the target project");
    }
    if (state.turns.some((turn) => normalizeQuestion(turn.question) === normalizeQuestion(effective.question!))) {
      throw new Error("Question repeats an earlier question");
    }
    state.currentAcknowledgement = effective.acknowledgement;
    state.currentTransition = effective.transition;
    state.currentClarification = undefined;
    state.currentQuestion = effective.question;
  }
  state.traces.push({
    turnId,
    targetDepth: effective.targetDepth,
    followsLeadId: effective.followsLeadId,
    knowledgeIds: effective.knowledgeIds,
    transition: effective.transition,
    action: effective.action,
    targetFieldId: effective.targetFieldId,
    reason: effective.reason,
    acknowledgement: effective.acknowledgement,
    generatedQuestion: effective.question,
    completionBlockers: effective.action === "FINISH_INTERVIEW" ? completion.blockers : undefined,
  });
  return { state, decision: effective, question: effective.question, evidence: [] };
}

export function setStepExecution(state: InterviewState, execution: StepExecutionTrace): void {
  const trace = state.traces.at(-1);
  if (!trace) throw new Error("Interview has no decision trace");
  trace.execution = execution;
}

export { buildCandidateFromIntake, buildInterviewRole, normalizeInterviewIntake } from "./intake.ts";
export {
  buildCandidateReportArtifact,
  buildInterviewReportBundle,
  renderInterviewReportMarkdown,
} from "./report-output.ts";
export type {
  CandidateReportArtifact,
  InterviewReportBundle,
} from "./report-output.ts";

export function getDemoInterviewDecision(state: InterviewState): InterviewDecision {
  const openContradiction = state.report.contradictions.find((item) => item.status === "open" && (!item.projectId || !projectPauseReason(state, item.projectId)));
  const contradictionField = openContradiction && state.report.fields.find((field) =>
    field.projectId === openContradiction.projectId && field.status === "contradicted"
  );
  const currentProjectId = state.turns.at(-1)?.projectId;
  const stay = currentProjectId && projectInvestigationBlockers(state, currentProjectId).length > 0;
  const saturated = new Set(saturatedFieldIds(state));
  const projects = state.candidate.projects.toSorted((left, right) => projectValue(right) - projectValue(left))
    .filter((project) => !projectPauseReason(state, project.id) && (!stay || project.id === currentProjectId));
  const available = projects.flatMap((project) => state.report.fields.filter((field) => field.projectId === project.id && !saturated.has(field.id)));
  const needsDepth = state.phaseVersion === 3 ? available.find((field) => !state.report.fields.some((item) =>
    item.projectId === field.projectId && (fieldConclusion(state, item.id).reachedDepth ?? 0) >= 3)) : undefined;
  const field = contradictionField ?? available.find((field) => field.status === "missing") ?? needsDepth;
  if (!field) return { action: "FINISH_INTERVIEW", reason: "The Candidate Report has no completion blockers." };
  return {
    action: "ASK_CANDIDATE",
    targetFieldId: field.id,
    reason: openContradiction ? "Clarify an unresolved contradiction." : field.description,
    targetDepth: state.phaseVersion === 3 ? Math.min(5, (fieldConclusion(state, field.id).reachedDepth ?? 0) + 1) as DepthLevel : undefined,
    question: state.phaseVersion === 3 && state.turns.some((turn) => turn.reportFieldId === field.id)
      ? `关于“${state.candidate.projects.find((project) => project.id === field.projectId)!.name}”，你第 ${answerTurnCount(state) + 1} 次补充想说明的选择依据是什么？`
      : demoQuestion(state, field, Boolean(openContradiction)),
  };
}

export function startInterview(state: InterviewState): InterviewStep {
  activateInterview(state);
  return applyInterviewDecision(state, getDemoInterviewDecision(state));
}

export function submitAnswer(
  state: InterviewState,
  answer: string,
  proposedEvidence?: readonly EvidenceProposal[],
  disposition: AnswerDisposition = "substantive",
): InterviewStep {
  let answerProjectId: string | undefined;
  if (state.openFloor) {
    const reply = demoOpenFloorReply(answer);
    if (reply.kind !== "topic") {
      const turn = recordDiscussion(state, answer, reply.response);
      return applyInterviewDecision(state, { action: reply.kind === "done" ? "CANDIDATE_FINISH" : "FINISH_INTERVIEW", reason: "Candidate-led discussion" }, turn.id);
    }
    answerProjectId = addCandidateTopic(state, answer, reply.title!);
  }
  const record = recordAnswer(state, answer, proposedEvidence, disposition, [], undefined, answerProjectId);
  const step = applyInterviewDecision(state, getDemoInterviewDecision(state), record.turn.id);
  step.evidence = record.evidence;
  return step;
}

function normalizeQuestion(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function demoQuestion(state: InterviewState, field: ReportField, contradiction: boolean): string {
  const project = state.candidate.projects.find((item) => item.id === field.projectId)!;
  if (contradiction) return `关于“${project.name}”的个人贡献，前后信息不一致，准确情况是什么？`;
  if (field.id.endsWith(":ownership")) return `在“${project.name}”中，你本人具体负责的关键工作是什么？`;
  if (field.id.endsWith(":mechanism")) return `“${project.name}”采用的关键方法或流程是什么？`;
  if (field.id.endsWith(":measurement")) return `你判断“${project.name}”结果达成的主要依据是什么？`;
  return `“${project.name}”中最需要你处理的一次问题或偏差是什么？`;
}

// ponytail: deterministic demo extraction proves the report flow; configured LLM mode supplies grounded edits.
function extractDemoEvidence(answer: string, project: Project, field: ReportField): EvidenceProposal {
  const vague = /不清楚|不知道|忘了|记不清|没有保留/.test(answer);
  const denial = /不是我|并不是我|没有主导/.test(answer);
  const specificity = Math.min(1, 0.2 + answer.length / 80);
  const claimIds = project.claims.filter((claim) =>
    claim.relatedCompetencies.includes(field.competencyId)
      || (field.id.endsWith(":ownership") && /负责|主导|设计|实现/.test(claim.text))
      || (field.id.endsWith(":measurement") && /%|准确率|延迟|提升|降低/.test(claim.text))
  ).map((claim) => claim.id);
  return {
    reportFieldIds: [field.id],
    claimIds,
    competencyId: field.competencyId,
    statement: vague ? `${field.name} 仍缺少可靠细节。` : `候选人说明了 ${field.name}。`,
    polarity: denial ? "invalidate" : vague ? "weakness" : "support",
    strength: vague ? 0.4 : 0.8,
    specificity: vague ? Math.max(0.3, specificity) : Math.max(0.7, specificity),
    evaluatorConfidence: 0.7,
    sourceQuote: answer,
    depthLevel: vague ? 3 : /因为|依据|对照|定位|因此|比较/.test(answer) ? 3 : /\d|逐条|接收.*核对|三步|先.{1,15}再/.test(answer) ? 2 : 1,
  };
}

export function validateCandidateAside(text: string): void {
  validateCandidateQuestion("你想补充什么？", text);
}
export function recordClarification(state: InterviewState, request: string, response: string): InterviewStep {
  if (state.status !== "active" || !state.currentQuestion) throw new Error("No question to clarify");
  if ((state.clarifications ?? []).some((item) => item.question === state.currentQuestion)) throw new Error("Only one clarification per question");
  validateCandidateAside(response);
  state.clarifications = [...(state.clarifications ?? []), { id: globalThis.crypto.randomUUID(), question: state.currentQuestion, request,
    response, timestamp: new Date().toISOString() }];
  return applyInterviewDecision(state, { action: "CLARIFY_QUESTION", reason: "Candidate requested clarification", clarification: response,
    targetFieldId: state.traces.at(-1)?.targetFieldId, targetDepth: state.traces.at(-1)?.targetDepth });
}
