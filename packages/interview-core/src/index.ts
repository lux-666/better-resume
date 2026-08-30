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
}

export interface TopicThread {
  id: string;
  projectId: string;
  name: string;
  status: "candidate" | "active" | "paused" | "completed";
  summary: string;
  evidenceIds: string[];
  unresolvedGaps: EvidenceGap[];
  pendingLeads: string[];
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

export interface CompetencyState {
  competencyId: string;
  score?: number;
  confidence: number;
  evidenceIds: string[];
  missingEvidence: string[];
  contradictoryEvidence: string[];
}

export interface DecisionTrace {
  turnId?: string;
  action: InterviewAction;
  projectId?: string;
  topicId?: string;
  selectedSkill?: string;
  selectedProbe?: string;
  targetGap?: string;
  reason: string;
  generatedQuestion?: string;
}

export interface InterviewState {
  sessionId: string;
  roleId: string;
  status: "draft" | "active" | "completed";
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

export function createInterviewState(sessionId: string, roleId: string, candidate: CandidateProfile): InterviewState {
  return {
    sessionId, roleId, status: "draft", candidate,
    turns: [], evidence: [], competencies: [], traces: [],
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
    ],
  };
  return {
    id: globalThis.crypto.randomUUID(),
    name,
    education: [],
    experiences: [],
    projects: [project],
    skills: ["RAG", "TypeScript"],
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

function switchTopicDecision(project: Project, topic: TopicThread, reason: string): InterviewDecision {
  const gap = topic.unresolvedGaps
    .filter((item) => item.status === "open")
    .toSorted((left, right) => right.importance - left.importance)[0];
  return {
    action: "SWITCH_TOPIC",
    projectId: project.id,
    topicId: topic.id,
    skill: gap ? skillFor(gap) : undefined,
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
  const gap = topic?.unresolvedGaps.find((item) => item.status === "open");
  if (!project || !topic || !gap) throw new Error("Active interview context is incomplete");
  return { project, topic, gap };
}

export function submitAnswer(
  state: InterviewState,
  answer: string,
  proposedEvidence?: readonly EvidenceProposal[],
): InterviewStep {
  if (state.status !== "active" || !state.currentQuestion) throw new Error("Interview is not awaiting an answer");
  const text = answer.trim();
  if (!text) throw new Error("Answer cannot be empty");
  const { project, topic, gap } = getActiveInterviewContext(state);

  const turn: InterviewTurn = {
    id: globalThis.crypto.randomUUID(),
    index: state.turns.length,
    projectId: project.id,
    topicId: topic.id,
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
  if (evidence.some((item) =>
    item.competencyId === gap.competencyId && item.polarity === "support" && item.specificity >= 0.5
  )) gap.status = "resolved";
  if (!topic.unresolvedGaps.some((item) => item.status === "open")) topic.saturation = 1;
  for (const competencyId of new Set(evidence.map((item) => item.competencyId))) {
    updateCompetency(state, competencyId);
  }

  const decision = getNextInterviewAction(state);
  activateDecisionTarget(state, decision);
  const question = decision.action === "FINISH" ? undefined : questionFor(state, decision);
  state.status = decision.action === "FINISH" ? "completed" : "active";
  state.currentQuestion = question;
  state.traces.push(traceFor(decision, question, turn.id));
  return { state, decision, question, evidence };
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
    .filter((claim) => isMetric ? /%|准确率|提升/.test(claim.text) : /负责|架构|实现/.test(claim.text))
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

function updateClaims(state: InterviewState, project: Project, evidence: Evidence): void {
  const claims = [...project.claims, ...state.candidate.claims].filter((claim) => evidence.claimIds.includes(claim.id));
  for (const claim of claims) {
    if (evidence.polarity === "support") {
      claim.status = "supported";
      claim.supportingEvidenceIds.push(evidence.id);
    } else {
      claim.status = "weakened";
      (claim.weakEvidenceIds ??= []).push(evidence.id);
    }
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
  if (decision.action !== "SWITCH_TOPIC" || !decision.projectId || !decision.topicId) return;
  const project = state.candidate.projects.find((item) => item.id === decision.projectId);
  if (!project) return;
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
  const gap = topic?.unresolvedGaps.find((item) => item.status === "open");
  if (!project || !topic || !gap) return "请介绍一个最能体现你能力的项目，以及你本人完成的部分。";
  const followUp = topic.turnIds.length > 0;
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
  const gap = activeTopic.unresolvedGaps
    .filter((item) => item.status === "open")
    .toSorted((left, right) => right.importance - left.importance)[0];
  if (gap && activeTopic.turnIds.length < HARD_MAX_TOPIC_TURNS && activeTopic.saturation < 0.85) {
    return {
      action: "CONTINUE_TOPIC", projectId: activeProject.id, topicId: activeTopic.id,
      skill: skillFor(gap), targetGap: gap.type, reason: gap.description,
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
  return project
    ? { action: "SWITCH_PROJECT", projectId: project.id, reason: "The current project has no useful open topic." }
    : { action: "FINISH", reason: "No high-value project or topic remains." };
}
