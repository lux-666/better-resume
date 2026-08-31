export type InterviewAction =
  | "CONTINUE_TOPIC" | "SWITCH_TOPIC" | "SWITCH_PROJECT" | "SCENARIO_PROBE"
  | "CLARIFY_CONTRADICTION" | "GENERAL_PROBE" | "FINISH";

export interface Claim {
  id: string;
  source: "resume" | "candidate_answer";
  text: string;
  projectId?: string;
  status: "unverified" | "supported" | "weakened" | "contradicted";
  relatedCompetencies: string[];
  supportingEvidenceIds: string[];
  weakEvidenceIds: string[];
  contradictingEvidenceIds: string[];
}

export interface EvidenceGap {
  competencyId: string;
  type: string;
  description: string;
  importance: number;
  status: "open" | "resolved" | "low_value";
  probeCoverage?: ProbeCoverage[];
}

export type ProbeKind =
  | "ownership_boundary" | "technical_mechanism" | "decision_alternatives"
  | "tradeoff" | "failure_diagnosis" | "measurement" | "reflection" | "concrete_example"
  | "contradiction_clarification";

export type LeadSignal = "mechanism" | "decision" | "tradeoff" | "failure" | "measurement" | "other";

export interface ProbeCoverage {
  probe: ProbeKind;
  status: "partial" | "sufficient";
  sourceQuote: string;
}

export interface FollowUpLeadProposal {
  text: string;
  sourceQuote: string;
  signal: LeadSignal;
  probeCoverage: ProbeCoverage[];
}

export interface FollowUpLead extends FollowUpLeadProposal {
  id: string;
  status: "pending" | "active" | "resolved" | "low_value";
  lowYieldCount: number;
}

export interface TopicThread {
  id: string;
  projectId: string;
  name: string;
  status: "candidate" | "active" | "paused" | "completed";
  summary: string;
  evidenceIds: string[];
  unresolvedGaps: EvidenceGap[];
  pendingLeads: FollowUpLead[];
  relatedCompetencies: string[];
  turnIds: string[];
  saturation: number;
  expectedInformationGain: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  candidateRole?: string;
  technologies: string[];
  outcomes: string[];
  claims: Claim[];
  mappedCompetencies: string[];
  topics: TopicThread[];
  status: "unexplored" | "active" | "completed";
  roleRelevance?: number;
}

export interface CandidateProfile {
  id: string;
  name: string;
  education: string[];
  experiences: string[];
  projects: Project[];
  skills: string[];
  claims: Claim[];
}

export interface InterviewTurn {
  id: string;
  index: number;
  projectId?: string;
  topicId?: string;
  acknowledgement?: string;
  question: string;
  answer: string;
  timestamp: string;
}

export interface Evidence {
  id: string;
  turnId: string;
  projectId?: string;
  topicId?: string;
  claimIds: string[];
  competencyId: string;
  statement: string;
  polarity: "support" | "weakness" | "invalidate";
  strength: number;
  specificity: number;
  evaluatorConfidence: number;
  sourceQuote: string;
}

export type EvidenceProposal = Omit<Evidence, "id" | "turnId" | "projectId" | "topicId">;
export type AnswerDisposition = "substantive" | "vague" | "denial" | "contradiction" | "irrelevant";

export interface CompetencyState {
  competencyId: string;
  score?: number;
  confidence: number;
  evidenceIds: string[];
  missingEvidence: string[];
  contradictoryEvidence: string[];
}

export interface TaskExecutionTrace {
  source: "demo" | "llm";
  durationMs: number;
  retryCount: number;
}

export interface StepExecutionTrace {
  mode: "demo" | "llm";
  provider?: string;
  modelId?: string;
  evidence?: TaskExecutionTrace;
  question?: TaskExecutionTrace;
}

export interface DecisionTrace {
  turnId?: string;
  action: InterviewAction;
  projectId?: string;
  topicId?: string;
  selectedSkill?: string;
  selectedProbe?: ProbeKind;
  selectedLead?: string;
  targetGap?: string;
  reason: string;
  acknowledgement?: string;
  generatedQuestion?: string;
  execution?: StepExecutionTrace;
}

export interface InterviewProgress {
  stage: "not_started" | "interviewing" | "completed";
  coveragePercent: number;
  turns: { completed: number; max: number };
  projects: { covered: number; total: number };
  topics: { covered: number; total: number };
  gaps: { closed: number; total: number };
  coreCompetencies: { covered: number; total: number };
  contradictionsOpen: number;
}

export interface InterviewState {
  sessionId: string;
  roleId: string;
  status: "draft" | "active" | "completed";
  currentAcknowledgement?: string;
  currentQuestion?: string;
  candidate: CandidateProfile;
  turns: InterviewTurn[];
  evidence: Evidence[];
  competencies: CompetencyState[];
  traces: DecisionTrace[];
}

export interface InterviewDecision {
  action: InterviewAction;
  projectId?: string;
  topicId?: string;
  skill?: string;
  selectedProbe?: ProbeKind;
  selectedLeadId?: string;
  selectedLead?: string;
  targetGap?: string;
  reason: string;
}

export interface InterviewStep {
  state: InterviewState;
  decision: InterviewDecision;
  question?: string;
  evidence: Evidence[];
}

const HARD_MAX_TURNS = 15;
const HARD_MAX_TOPIC_TURNS = 6;

export interface AnswerAnalysisDetails {
  followUpLeads?: readonly FollowUpLeadProposal[];
  probeCoverage?: readonly ProbeCoverage[];
}

export function createInterviewState(sessionId: string, roleId: string, candidate: CandidateProfile): InterviewState {
  return {
    sessionId, roleId, status: "draft", candidate,
    turns: [], evidence: [], competencies: [], traces: [],
  };
}

export function getInterviewProgress(
  state: InterviewState,
  coreCompetencyIds: readonly string[],
): InterviewProgress {
  const projects = state.candidate.projects;
  const topics = projects.flatMap((project) => project.topics);
  const gaps = topics.flatMap((topic) => topic.unresolvedGaps);
  const coveredCoreCompetencies = coreCompetencyIds.filter((competencyId) => {
    const competency = state.competencies.find((item) => item.competencyId === competencyId);
    return competency !== undefined && competency.evidenceIds.length > 0 && competency.confidence >= 0.3;
  }).length;
  const closedGaps = gaps.filter((gap) => gap.status !== "open").length;
  const coverageTotal = gaps.length + coreCompetencyIds.length;
  return {
    stage: state.status === "draft" ? "not_started" : state.status === "completed" ? "completed" : "interviewing",
    coveragePercent: coverageTotal === 0 ? 0 : Math.round((closedGaps + coveredCoreCompetencies) / coverageTotal * 100),
    turns: { completed: state.turns.length, max: HARD_MAX_TURNS },
    projects: {
      covered: projects.filter((project) => project.topics.some((topic) => topic.turnIds.length > 0)).length,
      total: projects.length,
    },
    topics: { covered: topics.filter((topic) => topic.turnIds.length > 0).length, total: topics.length },
    gaps: { closed: closedGaps, total: gaps.length },
    coreCompetencies: { covered: coveredCoreCompetencies, total: coreCompetencyIds.length },
    contradictionsOpen: gaps.filter((gap) => isContradictionGap(gap) && gap.status === "open").length,
  };
}

export function createFixtureCandidate(name = "匿名候选人"): CandidateProfile {
  const projectId = "project_enterprise_rag";
  const ownershipClaim: Claim = {
    id: "claim_rag_ownership",
    source: "resume",
    text: "负责企业 RAG 知识库的架构与实现",
    projectId,
    status: "unverified",
    relatedCompetencies: ["rag_engineering", "software_engineering"],
    supportingEvidenceIds: [],
    weakEvidenceIds: [],
    contradictingEvidenceIds: [],
  };
  const metricClaim: Claim = {
    id: "claim_rag_metric",
    source: "resume",
    text: "回答准确率提高 15%",
    projectId,
    status: "unverified",
    relatedCompetencies: ["rag_engineering", "evaluation"],
    supportingEvidenceIds: [],
    weakEvidenceIds: [],
    contradictingEvidenceIds: [],
  };
  const project: Project = {
    id: projectId,
    name: "企业 RAG 知识库",
    description: "基于向量检索与 reranker 的企业知识问答系统",
    candidateRole: "AI / LLM 应用工程师",
    technologies: ["TypeScript", "BGE", "Milvus", "Reranker"],
    outcomes: ["回答准确率提高 15%"],
    claims: [ownershipClaim, metricClaim],
    mappedCompetencies: ["rag_engineering", "software_engineering", "evaluation"],
    status: "unexplored",
    roleRelevance: 1,
    topics: [
      {
        id: "topic_ownership",
        projectId,
        name: "个人贡献",
        status: "candidate",
        summary: "验证候选人与团队工作的边界",
        evidenceIds: [],
        unresolvedGaps: [{
          competencyId: "software_engineering",
          type: "ownership_scope",
          description: "简历没有说明候选人本人完成了哪些设计与实现。",
          importance: 1,
          status: "open",
        }],
        pendingLeads: [],
        relatedCompetencies: ["software_engineering"],
        turnIds: [],
        saturation: 0,
        expectedInformationGain: 1,
      },
      {
        id: "topic_evaluation",
        projectId,
        name: "效果评估",
        status: "candidate",
        summary: "验证准确率提升的定义与测量过程",
        evidenceIds: [],
        unresolvedGaps: [{
          competencyId: "evaluation",
          type: "metric_definition",
          description: "15% 的提升缺少指标定义、基线与测试集。",
          importance: 0.9,
          status: "open",
        }],
        pendingLeads: [],
        relatedCompetencies: ["evaluation"],
        turnIds: [],
        saturation: 0,
        expectedInformationGain: 0.9,
      },
      {
        id: "topic_rag_failure",
        projectId,
        name: "故障复盘",
        status: "candidate",
        summary: "验证线上故障的定位、根因与预防措施",
        evidenceIds: [],
        unresolvedGaps: [{
          competencyId: "problem_solving",
          type: "failure_analysis",
          description: "缺少一次真实故障的诊断过程、根因和修复验证。",
          importance: 0.8,
          status: "open",
        }],
        pendingLeads: [],
        relatedCompetencies: ["problem_solving"],
        turnIds: [],
        saturation: 0,
        expectedInformationGain: 0.8,
      },
    ],
  };
  const agentProjectId = "project_service_agent";
  const agentOwnershipClaim: Claim = {
    id: "claim_agent_ownership",
    source: "resume",
    text: "主导客服 Agent 工作流的设计与落地",
    projectId: agentProjectId,
    status: "unverified",
    relatedCompetencies: ["agent_engineering", "software_engineering"],
    supportingEvidenceIds: [],
    weakEvidenceIds: [],
    contradictingEvidenceIds: [],
  };
  const agentMetricClaim: Claim = {
    id: "claim_agent_metric",
    source: "resume",
    text: "平均响应延迟降低 30%",
    projectId: agentProjectId,
    status: "unverified",
    relatedCompetencies: ["agent_engineering", "evaluation"],
    supportingEvidenceIds: [],
    weakEvidenceIds: [],
    contradictingEvidenceIds: [],
  };
  const agentProject: Project = {
    id: agentProjectId,
    name: "客服 Agent 工作流",
    description: "包含工具调用、状态管理和人工升级的客服 Agent",
    candidateRole: "AI / LLM 应用工程师",
    technologies: ["TypeScript", "Tool Calling", "State Machine"],
    outcomes: ["平均响应延迟降低 30%"],
    claims: [agentOwnershipClaim, agentMetricClaim],
    mappedCompetencies: ["agent_engineering", "software_engineering", "evaluation", "problem_solving"],
    status: "unexplored",
    roleRelevance: 0.8,
    topics: [
      {
        id: "topic_agent_ownership",
        projectId: agentProjectId,
        name: "Agent 个人贡献",
        status: "candidate",
        summary: "验证工作流设计与实现的个人边界",
        evidenceIds: [],
        unresolvedGaps: [{
          competencyId: "agent_engineering",
          type: "ownership_scope",
          description: "简历没有区分候选人与团队在 Agent 工作流中的贡献。",
          importance: 1,
          status: "open",
        }],
        pendingLeads: [],
        relatedCompetencies: ["agent_engineering"],
        turnIds: [],
        saturation: 0,
        expectedInformationGain: 1,
      },
      {
        id: "topic_agent_evaluation",
        projectId: agentProjectId,
        name: "Agent 效果评估",
        status: "candidate",
        summary: "验证延迟指标、基线与归因",
        evidenceIds: [],
        unresolvedGaps: [{
          competencyId: "evaluation",
          type: "metric_definition",
          description: "30% 的延迟下降缺少统计口径、基线与流量范围。",
          importance: 0.9,
          status: "open",
        }],
        pendingLeads: [],
        relatedCompetencies: ["evaluation"],
        turnIds: [],
        saturation: 0,
        expectedInformationGain: 0.9,
      },
      {
        id: "topic_agent_failure",
        projectId: agentProjectId,
        name: "Agent 故障复盘",
        status: "candidate",
        summary: "验证工具调用失败的定位与恢复设计",
        evidenceIds: [],
        unresolvedGaps: [{
          competencyId: "problem_solving",
          type: "failure_analysis",
          description: "缺少工具调用故障的症状、根因和防复发措施。",
          importance: 0.8,
          status: "open",
        }],
        pendingLeads: [],
        relatedCompetencies: ["problem_solving"],
        turnIds: [],
        saturation: 0,
        expectedInformationGain: 0.8,
      },
    ],
  };
  return {
    id: globalThis.crypto.randomUUID(),
    name,
    education: [],
    experiences: [],
    projects: [project, agentProject],
    skills: ["RAG", "Agent", "TypeScript"],
    claims: [],
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

function skillFor(gap: EvidenceGap): string {
  if (gap.type.includes("ownership")) return "ownership-grill";
  if (gap.type.includes("metric")) return "metric-audit";
  if (gap.type.includes("failure")) return "failure-forensics";
  if (gap.type.includes("contradiction")) return "consistency-check";
  return "boundary-push";
}

function isContradictionGap(gap: EvidenceGap): boolean {
  return gap.type.startsWith("contradiction:");
}

function selectOpenGap(topic: TopicThread): EvidenceGap | undefined {
  return topic.unresolvedGaps
    .filter((item) => item.status === "open")
    .toSorted((left, right) => Number(isContradictionGap(right)) - Number(isContradictionGap(left))
      || right.importance - left.importance)[0];
}

function gapProbe(gap: EvidenceGap): ProbeKind {
  if (isContradictionGap(gap)) return "contradiction_clarification";
  if (gap.type.includes("ownership")) return "ownership_boundary";
  if (gap.type.includes("metric")) return "measurement";
  if (gap.type.includes("failure")) return "failure_diagnosis";
  return "concrete_example";
}

function leadProbeSequence(lead: FollowUpLead): ProbeKind[] {
  const first: Record<LeadSignal, ProbeKind> = {
    mechanism: "technical_mechanism",
    decision: "decision_alternatives",
    tradeoff: "tradeoff",
    failure: "failure_diagnosis",
    measurement: "measurement",
    other: "technical_mechanism",
  };
  return [...new Set([
    first[lead.signal],
    "decision_alternatives" as const,
    lead.signal === "failure" ? "failure_diagnosis" as const : "tradeoff" as const,
    "measurement" as const,
  ])];
}

function mergeProbeCoverage(target: ProbeCoverage[], incoming: readonly ProbeCoverage[]): boolean {
  let changed = false;
  for (const coverage of incoming) {
    const existing = target.find((item) => item.probe === coverage.probe);
    if (!existing) {
      target.push({ ...coverage });
      changed = true;
    } else if (existing.status === "partial" && coverage.status === "sufficient") {
      Object.assign(existing, coverage);
      changed = true;
    }
  }
  return changed;
}

function uncoveredProbe(lead: FollowUpLead): ProbeKind | undefined {
  return leadProbeSequence(lead).find((probe) =>
    !lead.probeCoverage.some((coverage) => coverage.probe === probe && coverage.status === "sufficient")
  );
}

function usableLead(topic: TopicThread): FollowUpLead | undefined {
  return topic.pendingLeads.find((lead) => lead.status === "active" && lead.lowYieldCount < 2 && uncoveredProbe(lead))
    ?? topic.pendingLeads.find((lead) => lead.status === "pending" && lead.lowYieldCount < 2 && uncoveredProbe(lead));
}

function normalizeLeadText(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function switchTopicDecision(project: Project, topic: TopicThread, reason: string): InterviewDecision {
  const gap = selectOpenGap(topic);
  return {
    action: "SWITCH_TOPIC",
    projectId: project.id,
    topicId: topic.id,
    skill: gap ? skillFor(gap) : undefined,
    selectedProbe: gap ? gapProbe(gap) : undefined,
    targetGap: gap?.type,
    reason,
  };
}

export function startInterview(state: InterviewState): InterviewStep {
  if (state.status !== "draft") throw new Error("Interview has already started");
  const project = selectAnchorProject(state.candidate.projects);
  if (!project) throw new Error("Interview requires at least one project");
  const topic = project.topics
    .filter((item) => item.status === "candidate")
    .toSorted((left, right) => right.expectedInformationGain - left.expectedInformationGain)[0];
  if (!topic) throw new Error("Anchor project requires at least one topic");

  state.status = "active";
  project.status = "active";
  topic.status = "active";
  const decision = getNextInterviewAction(state);
  const question = questionFor(state, decision);
  state.currentQuestion = question;
  state.traces.push(traceFor(decision, question));
  return { state, decision, question, evidence: [] };
}

export function getActiveInterviewContext(state: InterviewState): {
  project: Project;
  topic: TopicThread;
  gap: EvidenceGap;
} {
  const project = state.candidate.projects.find((item) => item.status === "active");
  const topic = project?.topics.find((item) => item.status === "active");
  const targetGap = state.traces.at(-1)?.targetGap;
  const gap = topic && (topic.unresolvedGaps.find((item) => item.type === targetGap) ?? selectOpenGap(topic));
  if (!project || !topic || !gap) throw new Error("Active interview context is incomplete");
  return { project, topic, gap };
}

export function submitAnswer(
  state: InterviewState,
  answer: string,
  proposedEvidence?: readonly EvidenceProposal[],
  disposition: AnswerDisposition = "substantive",
  details?: AnswerAnalysisDetails,
): InterviewStep {
  if (state.status !== "active" || !state.currentQuestion) throw new Error("Interview is not awaiting an answer");
  const text = answer.trim();
  if (!text) throw new Error("Answer cannot be empty");
  const { project, topic, gap } = getActiveInterviewContext(state);
  const activeLead = topic.pendingLeads.find((lead) => lead.status === "active");

  const turn: InterviewTurn = {
    id: globalThis.crypto.randomUUID(),
    index: state.turns.length,
    projectId: project.id,
    topicId: topic.id,
    acknowledgement: state.currentAcknowledgement,
    question: state.currentQuestion,
    answer: text,
    timestamp: new Date().toISOString(),
  };
  state.turns.push(turn);
  topic.turnIds.push(turn.id);

  const evidence = (proposedEvidence ?? [extractDemoEvidence(text, project, topic, gap)]).map((item): Evidence => ({
    ...item,
    id: globalThis.crypto.randomUUID(),
    turnId: turn.id,
    projectId: project.id,
    topicId: topic.id,
  }));
  state.evidence.push(...evidence);
  topic.evidenceIds.push(...evidence.map((item) => item.id));
  for (const item of evidence) updateClaims(state, project, item);
  const effectiveDisposition = proposedEvidence ? disposition
    : evidence.some((item) => item.polarity === "support") ? "substantive" : "vague";
  const relevantEvidence = evidence.filter((item) =>
    item.competencyId === gap.competencyId && item.specificity >= 0.5
  );
  const analysis = details ?? (proposedEvidence ? {} : extractDemoAnalysis(text));
  const selectedProbe = state.traces.at(-1)?.selectedProbe;
  const probeCoverage = analysis.probeCoverage?.length
    ? analysis.probeCoverage
    : selectedProbe && relevantEvidence.length > 0
        && effectiveDisposition !== "vague" && effectiveDisposition !== "irrelevant"
      ? [{ probe: selectedProbe, status: "sufficient" as const, sourceQuote: relevantEvidence[0].sourceQuote }]
      : [];
  if (activeLead) {
    const gainedCoverage = mergeProbeCoverage(activeLead.probeCoverage, probeCoverage);
    if (gainedCoverage) activeLead.lowYieldCount = 0;
    else activeLead.lowYieldCount += 1;
    if (activeLead.lowYieldCount >= 2) activeLead.status = "low_value";
    else if (!uncoveredProbe(activeLead)) activeLead.status = "resolved";
  } else {
    mergeProbeCoverage(gap.probeCoverage ??= [], probeCoverage);
  }
  for (const proposal of analysis.followUpLeads ?? []) {
    const duplicate = topic.pendingLeads.find((lead) =>
      normalizeLeadText(lead.text) === normalizeLeadText(proposal.text)
    );
    if (duplicate) {
      mergeProbeCoverage(duplicate.probeCoverage, proposal.probeCoverage);
      if (!uncoveredProbe(duplicate)) duplicate.status = "resolved";
    } else {
      const lead: FollowUpLead = {
        ...proposal,
        probeCoverage: proposal.probeCoverage.map((coverage) => ({ ...coverage })),
        id: globalThis.crypto.randomUUID(),
        status: "pending",
        lowYieldCount: 0,
      };
      if (!uncoveredProbe(lead)) lead.status = "resolved";
      topic.pendingLeads.push(lead);
    }
  }
  const primaryProbeCovered = gap.probeCoverage?.some((coverage) =>
    coverage.probe === gapProbe(gap) && coverage.status === "sufficient"
  ) ?? false;
  const hasRelevantEvidence = state.evidence.some((item) =>
    topic.evidenceIds.includes(item.id) && item.competencyId === gap.competencyId && item.specificity >= 0.5
  );
  if (isContradictionGap(gap)) {
    if (relevantEvidence.length > 0
      && (effectiveDisposition === "substantive" || effectiveDisposition === "denial")) gap.status = "resolved";
  } else if (primaryProbeCovered && hasRelevantEvidence && !usableLead(topic)) gap.status = "resolved";
  if (!isContradictionGap(gap)) {
    for (const item of evidence.filter((candidate) => candidate.polarity === "invalidate")) {
      for (const claimId of item.claimIds) {
        const claim = [...project.claims, ...state.candidate.claims].find((candidate) => candidate.id === claimId);
        if (!claim) continue;
        const type = `contradiction:${claim.id}`;
        const existing = topic.unresolvedGaps.find((candidate) => candidate.type === type);
        if (existing) existing.status = "open";
        else topic.unresolvedGaps.push({
          competencyId: item.competencyId,
          type,
          description: `候选人的回答与 Claim“${claim.text}”矛盾，需要澄清准确情况。`,
          importance: 1,
          status: "open",
        });
      }
    }
  }
  if (!topic.unresolvedGaps.some((item) => item.status === "open")) topic.saturation = 1;
  for (const competencyId of new Set(evidence.map((item) => item.competencyId))) {
    updateCompetency(state, competencyId);
  }

  const decision = getNextInterviewAction(state);
  activateDecisionTarget(state, decision);
  const question = decision.action === "FINISH" ? undefined : questionFor(state, decision);
  state.status = decision.action === "FINISH" ? "completed" : "active";
  state.currentAcknowledgement = undefined;
  state.currentQuestion = question;
  state.traces.push(traceFor(decision, question, turn.id));
  return { state, decision, question, evidence };
}

export function setGeneratedPrompt(
  state: InterviewState,
  prompt: { acknowledgement?: string; question: string },
): void {
  if (state.status !== "active" || !state.currentQuestion) throw new Error("Interview is not awaiting a question");
  state.currentAcknowledgement = prompt.acknowledgement;
  state.currentQuestion = prompt.question;
  const trace = state.traces.at(-1);
  if (!trace || trace.action === "FINISH") throw new Error("Interview has no question trace");
  trace.acknowledgement = prompt.acknowledgement;
  trace.generatedQuestion = prompt.question;
}

export function setStepExecution(state: InterviewState, execution: StepExecutionTrace): void {
  const trace = state.traces.at(-1);
  if (!trace) throw new Error("Interview has no decision trace");
  trace.execution = execution;
}

// ponytail: deterministic demo extraction proves the data flow; replace with Pi structured output before real evaluation.
function extractDemoEvidence(
  answer: string,
  project: Project,
  topic: TopicThread,
  gap: EvidenceGap,
): EvidenceProposal {
  const isMetric = gap.type.includes("metric");
  const hasSignal = isMetric
    ? /基线|测试集|样本|准确率|召回率|precision|recall|评估|指标/i.test(answer)
    : /我|本人|负责|独立|主导|实现|设计|编写/.test(answer);
  const specificity = Math.min(1, 0.2 + answer.length / 80);
  const supported = hasSignal && specificity >= 0.5;
  const claimIds = project.claims
    .filter((claim) => isMetric
      ? /%|准确率|延迟|提升|降低/.test(claim.text)
      : /负责|主导|架构|设计|实现/.test(claim.text))
    .map((claim) => claim.id);
  return {
    claimIds,
    competencyId: gap.competencyId,
    statement: supported ? `候选人提供了${topic.name}的具体说明。` : `候选人的回答尚未明确${topic.name}。`,
    polarity: supported ? "support" : "weakness",
    strength: supported ? Math.min(1, 0.5 + specificity / 2) : 0.4,
    specificity,
    evaluatorConfidence: 0.65,
    sourceQuote: answer,
  };
}

// ponytail: demo-only phrase matching; configured LLM mode supplies structured leads.
function extractDemoAnalysis(answer: string): AnswerAnalysisDetails {
  const failure = answer.match(/([^，。；]{2,40}(?:不稳定|失败|故障|异常|问题)[^，。；]{0,30})/);
  const mechanism = answer.match(/(?:使用|用了|用的是|采用)\s*([^，。；]{2,40})/i);
  const match = failure ?? mechanism;
  if (!match) return {};
  const sourceQuote = match[1].trim();
  const signal: LeadSignal = failure ? "failure" : "mechanism";
  const probe: ProbeKind = failure ? "failure_diagnosis" : "technical_mechanism";
  return {
    followUpLeads: [{
      text: sourceQuote,
      sourceQuote,
      signal,
      probeCoverage: [{ probe, status: "partial", sourceQuote }],
    }],
  };
}

function updateClaims(state: InterviewState, project: Project, evidence: Evidence): void {
  const claims = [...project.claims, ...state.candidate.claims].filter((claim) => evidence.claimIds.includes(claim.id));
  for (const claim of claims) {
    if (evidence.polarity === "support") {
      claim.supportingEvidenceIds.push(evidence.id);
    } else if (evidence.polarity === "weakness") {
      (claim.weakEvidenceIds ??= []).push(evidence.id);
    } else {
      (claim.contradictingEvidenceIds ??= []).push(evidence.id);
    }
    claim.status = claim.contradictingEvidenceIds.length > 0 ? "contradicted"
      : claim.supportingEvidenceIds.length > 0 ? "supported"
        : "weakened";
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
  const missingEvidence = state.candidate.projects
    .flatMap((project) => project.topics)
    .flatMap((topic) => topic.unresolvedGaps)
    .filter((gap) => gap.competencyId === competencyId && gap.status === "open")
    .map((gap) => gap.description);
  const current = state.competencies.find((item) => item.competencyId === competencyId);
  const next: CompetencyState = {
    competencyId,
    score,
    confidence,
    evidenceIds: evidence.map((item) => item.id),
    missingEvidence,
    contradictoryEvidence: evidence.filter((item) => item.polarity === "invalidate").map((item) => item.id),
  };
  if (current) Object.assign(current, next);
  else state.competencies.push(next);
}

function activateDecisionTarget(state: InterviewState, decision: InterviewDecision): void {
  if (decision.action === "FINISH") {
    for (const project of state.candidate.projects) {
      if (project.status === "active") project.status = "completed";
      for (const topic of project.topics) if (topic.status === "active") topic.status = "completed";
    }
    return;
  }
  if (decision.selectedLeadId && decision.projectId && decision.topicId) {
    const topic = state.candidate.projects.find((item) => item.id === decision.projectId)
      ?.topics.find((item) => item.id === decision.topicId);
    for (const lead of topic?.pendingLeads ?? []) {
      if (lead.status === "active") lead.status = "pending";
      if (lead.id === decision.selectedLeadId) lead.status = "active";
    }
  }
  if ((decision.action !== "SWITCH_TOPIC" && decision.action !== "SWITCH_PROJECT")
    || !decision.projectId || !decision.topicId) return;
  const project = state.candidate.projects.find((item) => item.id === decision.projectId);
  if (!project) return;
  if (decision.action === "SWITCH_PROJECT") {
    for (const item of state.candidate.projects) {
      if (item.status === "active") {
        item.status = "completed";
        for (const topic of item.topics) if (topic.status === "active") topic.status = "completed";
      }
      if (item.id === project.id) item.status = "active";
    }
  }
  for (const topic of project.topics) {
    if (topic.status === "active") topic.status = "completed";
    if (topic.id === decision.topicId) topic.status = "active";
  }
}

function questionFor(state: InterviewState, decision: InterviewDecision): string {
  const project = state.candidate.projects.find((item) => item.id === decision.projectId)
    ?? state.candidate.projects.find((item) => item.status === "active");
  const topic = project?.topics.find((item) => item.id === decision.topicId)
    ?? project?.topics.find((item) => item.status === "active");
  const gap = topic && (topic.unresolvedGaps.find((item) => item.type === decision.targetGap) ?? selectOpenGap(topic));
  const lead = topic?.pendingLeads.find((item) => item.id === decision.selectedLeadId);
  if (!project || !topic || !gap) return "请介绍一个最能体现你能力的项目，以及你本人完成的部分。";
  const followUp = topic.turnIds.length > 0;
  if (isContradictionGap(gap)) {
    const claim = [...project.claims, ...state.candidate.claims]
      .find((item) => gap.type === `contradiction:${item.id}`);
    return `关于“${claim?.text ?? gap.description}”，现有信息并不一致。请说明准确情况。`;
  }
  if (lead) {
    if (decision.selectedProbe === "technical_mechanism") return `你提到“${lead.text}”，它具体是怎么实现的？`;
    if (decision.selectedProbe === "decision_alternatives") return `关于“${lead.text}”，哪个关键比较让你最终选择了这个方案？`;
    if (decision.selectedProbe === "tradeoff") return `采用“${lead.text}”带来的主要代价是什么？`;
    if (decision.selectedProbe === "failure_diagnosis") return `你如何确认“${lead.text}”的根因？`;
    if (decision.selectedProbe === "measurement") return `你用什么结果判断“${lead.text}”确实有效？`;
    if (decision.selectedProbe === "reflection") return `复盘“${lead.text}”，你现在会改变哪项设计？`;
  }
  if (gap.type.includes("ownership")) {
    return followUp
      ? `请只选“${project.name}”里一项你本人完成的工作，说明你的具体决策和实现。`
      : `在“${project.name}”中，你本人具体负责了哪些设计和实现？`;
  }
  if (gap.type.includes("metric")) {
    return `你提到“${project.claims.find((claim) => gap.competencyId === "evaluation" && claim.relatedCompetencies.includes("evaluation"))?.text ?? project.outcomes[0]}”，这个指标如何定义，基线和测试集分别是什么？`;
  }
  return `关于“${topic.name}”，请给出一个你亲自处理的具体例子。`;
}

function traceFor(decision: InterviewDecision, question?: string, turnId?: string): DecisionTrace {
  return {
    turnId,
    action: decision.action,
    projectId: decision.projectId,
    topicId: decision.topicId,
    selectedSkill: decision.skill,
    selectedProbe: decision.selectedProbe,
    selectedLead: decision.selectedLead,
    targetGap: decision.targetGap,
    reason: decision.reason,
    generatedQuestion: question,
  };
}

export function getNextInterviewAction(state: InterviewState): InterviewDecision {
  if (state.status === "completed" || state.turns.length >= HARD_MAX_TURNS) {
    return { action: "FINISH", reason: "Interview reached its terminal state or hard turn limit." };
  }
  const activeProject = state.candidate.projects.find((project) => project.status === "active");
  if (!activeProject) {
    const anchor = selectAnchorProject(state.candidate.projects);
    return anchor
      ? { action: "SWITCH_PROJECT", projectId: anchor.id, reason: "Selected the highest-value anchor project." }
      : { action: "GENERAL_PROBE", reason: "No project evidence is available yet." };
  }
  const activeTopic = activeProject.topics.find((topic) => topic.status === "active");
  if (!activeTopic) {
    const nextTopic = activeProject.topics
      .filter((topic) => topic.status === "candidate" || topic.status === "paused")
      .toSorted((left, right) => right.expectedInformationGain - left.expectedInformationGain)[0];
    return nextTopic
      ? switchTopicDecision(activeProject, nextTopic, "Selected the highest-information topic.")
      : nextProjectOrFinish(state, activeProject.id);
  }
  const gap = selectOpenGap(activeTopic);
  if (gap && isContradictionGap(gap)) {
    return {
      action: "CLARIFY_CONTRADICTION", projectId: activeProject.id, topicId: activeTopic.id,
      skill: "consistency-check", selectedProbe: "contradiction_clarification",
      targetGap: gap.type, reason: gap.description,
    };
  }
  const lead = usableLead(activeTopic);
  const contextGap = gap ?? activeTopic.unresolvedGaps.find((item) => item.type === state.traces.at(-1)?.targetGap);
  const selectedProbe = lead && uncoveredProbe(lead);
  if (lead && selectedProbe && contextGap
    && activeTopic.turnIds.length < HARD_MAX_TOPIC_TURNS && activeTopic.saturation < 0.85) {
    return {
      action: "CONTINUE_TOPIC", projectId: activeProject.id, topicId: activeTopic.id,
      skill: skillFor(contextGap), selectedProbe, selectedLeadId: lead.id, selectedLead: lead.text,
      targetGap: contextGap.type, reason: `Continue the active lead: ${lead.text}`,
    };
  }
  if (gap && activeTopic.turnIds.length < HARD_MAX_TOPIC_TURNS && activeTopic.saturation < 0.85) {
    return {
      action: "CONTINUE_TOPIC", projectId: activeProject.id, topicId: activeTopic.id,
      skill: skillFor(gap), selectedProbe: gapProbe(gap), targetGap: gap.type, reason: gap.description,
    };
  }
  const nextTopic = activeProject.topics
    .filter((topic) => topic.id !== activeTopic.id && topic.status !== "completed")
    .toSorted((left, right) => right.expectedInformationGain - left.expectedInformationGain)[0];
  return nextTopic
    ? switchTopicDecision(activeProject, nextTopic, "The current topic is saturated.")
    : nextProjectOrFinish(state, activeProject.id);
}

function nextProjectOrFinish(state: InterviewState, currentProjectId: string): InterviewDecision {
  const project = selectAnchorProject(
    state.candidate.projects.filter((item) => item.id !== currentProjectId && item.status !== "completed"),
  );
  if (!project) return { action: "FINISH", reason: "No high-value project or topic remains." };
  const topic = project.topics
    .filter((item) => item.status === "candidate" || item.status === "paused")
    .toSorted((left, right) => right.expectedInformationGain - left.expectedInformationGain)[0];
  const gap = topic ? selectOpenGap(topic) : undefined;
  return {
    action: "SWITCH_PROJECT",
    projectId: project.id,
    topicId: topic?.id,
    skill: gap ? skillFor(gap) : undefined,
    selectedProbe: gap ? gapProbe(gap) : undefined,
    targetGap: gap?.type,
    reason: "The current project has no useful open topic.",
  };
}
