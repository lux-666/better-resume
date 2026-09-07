import type { RolePack } from "./phase4-schema.ts";
export type InterviewAction = "ASK_CANDIDATE" | "FINISH_INTERVIEW" | "CLARIFY_QUESTION" | "RECORD_SUPPLEMENT" | "INVITE_CANDIDATE" | "CANDIDATE_FINISH";

export interface Claim {
  id: string;
  source: "resume" | "candidate_input" | "candidate_answer";
  text: string;
  sourceQuote?: string;
  sourceEvidenceId?: string;
  projectId?: string;
  status: "unverified" | "supported" | "weakened" | "contradicted";
  relatedCompetencies: string[];
  supportingEvidenceIds: string[];
  weakEvidenceIds: string[];
  contradictingEvidenceIds: string[];
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

export interface RoleCompetency {
  id: string;
  name: string;
  weight: number;
  core: boolean;
}

export interface InterviewRole {
  id: string;
  name: string;
  source: "generic" | "job_description" | "legacy_role";
  description: string;
  requirements: string[];
  competencies: RoleCompetency[];
}

export interface CandidateProjectIntake {
  name: string;
  description: string;
}

export interface CandidateIntake {
  name: string;
  skills: string[];
  projects: CandidateProjectIntake[];
}

export interface InterviewIntake {
  candidate: CandidateIntake;
  job?: {
    title: string;
    introduction: string;
    responsibilities: string;
    requirements: string;
  };
}

export type ReportFieldStatus = "missing" | "weak" | "supported" | "contradicted";

export interface ReportField {
  requirementIds?: string[];
  id: string;
  projectId: string;
  competencyId: string;
  name: string;
  description: string;
  importance: number;
  status: ReportFieldStatus;
  summary?: string;
  evidenceIds: string[];
}

export interface ReportContradiction {
  kind?: "claim" | "cross_project";
  id: string;
  claimId: string;
  projectId?: string;
  status: "open" | "resolved";
  evidenceIds: string[];
  resolutionEvidenceIds: string[];
}

export interface CandidateReport {
  objective: string;
  status: "in_progress" | "complete";
  fields: ReportField[];
  contradictions: ReportContradiction[];
}

export interface InterviewTurn {
  kind?: "answer" | "supplement" | "discussion";
  interviewerResponse?: string;
  targetDepth?: DepthLevel;
  disposition?: AnswerDisposition;
  id: string;
  index: number;
  projectId?: string;
  reportFieldId?: string;
  acknowledgement?: string;
  question: string;
  answer: string;
  timestamp: string;
}

export interface Evidence {
  depthLevel?: DepthLevel;
  id: string;
  turnId: string;
  projectId?: string;
  reportFieldIds: string[];
  claimIds: string[];
  competencyId: string;
  statement: string;
  polarity: "support" | "weakness" | "invalidate";
  strength: number;
  specificity: number;
  evaluatorConfidence: number;
  sourceQuote: string;
}

export type EvidenceProposal = Omit<Evidence, "id" | "turnId" | "projectId">;
export type AnswerDisposition = "substantive" | "vague" | "denial" | "contradiction" | "irrelevant" | "question_back" | "skip_request";

export interface CompetencyState {
  competencyId: string;
  score?: number;
  confidence: number;
  evidenceIds: string[];
  missingEvidence: string[];
  contradictoryEvidence: string[];
}

export interface TaskExecutionTrace {
  modelId?: string;
  fallbackUsed?: boolean;
  source: "demo" | "llm";
  durationMs: number;
  retryCount: number;
}

export interface StepExecutionTrace {
  mode: "demo" | "llm";
  provider?: string;
  modelId?: string;
  reportModelId?: string;
  interviewModelId?: string;
  evidence?: TaskExecutionTrace;
  question?: TaskExecutionTrace;
}

export interface DecisionTrace {
  knowledgeIds?: string[];
  targetDepth?: DepthLevel;
  followsLeadId?: string;
  transition?: string;
  clarification?: string;
  turnId?: string;
  action: InterviewAction;
  targetFieldId?: string;
  reason: string;
  acknowledgement?: string;
  generatedQuestion?: string;
  completionBlockers?: string[];
  execution?: StepExecutionTrace;
}

export interface InterviewProgress {
  stage: "not_started" | "interviewing" | "completed";
  coveragePercent: number;
  turns: { completed: number; max: number };
  projects: { covered: number; total: number };
  reportFields: { covered: number; total: number };
  coreCompetencies: { covered: number; total: number };
  contradictionsOpen: number;
}

export interface InterviewState {
  rolePack?: RolePack;
  rolePackFailure?: string;
  resumeIndexFailure?: string;
  maxTurns?: number;
  openFloor?: boolean;
  timeBudgetMinutes?: number;
  startedAt?: string;
  phaseVersion?: 3;
  leads?: Lead[];
  clarifications?: Clarification[];
  currentTransition?: string;
  currentClarification?: string;
  sessionId: string;
  roleId: string;
  role: InterviewRole;
  intake: InterviewIntake;
  status: "draft" | "active" | "completed";
  currentAcknowledgement?: string;
  currentQuestion?: string;
  candidate: CandidateProfile;
  report: CandidateReport;
  turns: InterviewTurn[];
  evidence: Evidence[];
  competencies: CompetencyState[];
  traces: DecisionTrace[];
}

export interface InterviewDecision {
  knowledgeIds?: string[];
  targetDepth?: DepthLevel;
  followsLeadId?: string;
  transition?: string;
  clarification?: string;
  action: InterviewAction;
  targetFieldId?: string;
  reason: string;
  acknowledgement?: string;
  question?: string;
}

export interface InterviewStep {
  state: InterviewState;
  decision: InterviewDecision;
  question?: string;
  evidence: Evidence[];
}

export interface AnswerRecord {
  state: InterviewState;
  turn: InterviewTurn;
  evidence: Evidence[];
}

export interface CompletionCheck {
  allowed: boolean;
  forced: boolean;
  blockers: string[];
  blockerCodes: string[];
}

export type DepthLevel = 1 | 2 | 3 | 4 | 5;
export interface LeadProposal {
  kind: "mechanism" | "metric" | "decision" | "constraint" | "failure" | "person_boundary";
  text: string;
  suggestedFieldId?: string;
}
export interface Lead extends LeadProposal { id: string; turnId: string; projectId: string; }
export interface Clarification { id: string; question: string; request: string; response: string; timestamp: string; }
