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
  competencyId: string;
  statement: string;
  polarity: "support" | "weakness" | "invalidate";
  strength: number;
  specificity: number;
  evaluatorConfidence: number;
  sourceQuote: string;
}

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
  candidate: CandidateProfile;
  projects: Project[];
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

const HARD_MAX_TURNS = 15;
const HARD_MAX_TOPIC_TURNS = 6;

export function createInterviewState(sessionId: string, roleId: string, candidate: CandidateProfile): InterviewState {
  return {
    sessionId, roleId, status: "draft", candidate, projects: candidate.projects,
    turns: [], evidence: [], competencies: [], traces: [],
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

export function getNextInterviewAction(state: InterviewState): InterviewDecision {
  if (state.status === "completed" || state.turns.length >= HARD_MAX_TURNS) {
    return { action: "FINISH", reason: "Interview reached its terminal state or hard turn limit." };
  }
  const activeProject = state.projects.find((project) => project.status === "active");
  if (!activeProject) {
    const anchor = selectAnchorProject(state.projects);
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
      ? { action: "SWITCH_TOPIC", projectId: activeProject.id, topicId: nextTopic.id, reason: "Selected the highest-information topic." }
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
    ? { action: "SWITCH_TOPIC", projectId: activeProject.id, topicId: nextTopic.id, reason: "The current topic is saturated." }
    : nextProjectOrFinish(state, activeProject.id);
}

function nextProjectOrFinish(state: InterviewState, currentProjectId: string): InterviewDecision {
  const project = selectAnchorProject(
    state.projects.filter((item) => item.id !== currentProjectId && item.status !== "completed"),
  );
  return project
    ? { action: "SWITCH_PROJECT", projectId: project.id, reason: "The current project has no useful open topic." }
    : { action: "FINISH", reason: "No high-value project or topic remains." };
}
