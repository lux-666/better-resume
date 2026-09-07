import { createHash } from "node:crypto";
import {
  activateInterview,
  applyInterviewDecision,
  createFixtureCandidate,
  createInterviewState,
  getDemoInterviewDecision,
  recordAnswer,
  type InterviewDecision,
  type InterviewState,
  type AnswerDisposition,
  type EvidenceProposal,
} from "../../../packages/interview-core/src/index.ts";
import {
  fixedProfileResponse,
  modelProfiles,
  type ModelProfileName,
} from "../../../packages/interview-core/src/fixed-profiles.ts";

type FrozenReportCase = {
  id: string;
  profile: ModelProfileName;
  state: InterviewState;
  answer: string;
  expectedAnswerDisposition: AnswerDisposition;
  expectedEvidence: EvidenceProposal[];
  expectedFieldIds: string[];
  expectedClaimIds: string[];
  fixtureFingerprint: string;
};

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function uniqueDemoDecision(state: InterviewState): InterviewDecision {
  const decision = getDemoInterviewDecision(state);
  if (decision.action !== "ASK_CANDIDATE" || !decision.question) return decision;
  if (!state.turns.some((turn) => normalize(turn.question) === normalize(decision.question!))) return decision;
  return {
    ...decision,
    question: decision.question.replace(/[?？]$/, `，请补充一个此前没有说明的具体细节（第 ${state.turns.length + 1} 轮）？`),
  };
}

function replaceEvidenceIds(ids: string[], evidenceIdMap: Map<string, string>): string[] {
  return ids.map((id) => evidenceIdMap.get(id) ?? id);
}

function deterministicState(state: InterviewState, profile: ModelProfileName): InterviewState {
  const frozen = structuredClone(state);
  frozen.candidate.id = `candidate:${profile}`;
  const turnIdMap = new Map(frozen.turns.map((turn) => [turn.id, `turn:${profile}:${turn.index}`]));
  const evidenceIdMap = new Map(frozen.evidence.map((evidence, index) => [evidence.id, `evidence:${profile}:${index}`]));
  for (const turn of frozen.turns) {
    turn.id = turnIdMap.get(turn.id)!;
    turn.timestamp = `2000-01-01T00:00:${String(turn.index).padStart(2, "0")}.000Z`;
  }
  for (const evidence of frozen.evidence) {
    evidence.id = evidenceIdMap.get(evidence.id)!;
    evidence.turnId = turnIdMap.get(evidence.turnId)!;
  }
  for (const claim of [...frozen.candidate.claims, ...frozen.candidate.projects.flatMap((project) => project.claims)]) {
    claim.supportingEvidenceIds = replaceEvidenceIds(claim.supportingEvidenceIds, evidenceIdMap);
    claim.weakEvidenceIds = replaceEvidenceIds(claim.weakEvidenceIds, evidenceIdMap);
    claim.contradictingEvidenceIds = replaceEvidenceIds(claim.contradictingEvidenceIds, evidenceIdMap);
  }
  for (const field of frozen.report.fields) field.evidenceIds = replaceEvidenceIds(field.evidenceIds, evidenceIdMap);
  for (const contradiction of frozen.report.contradictions) {
    contradiction.evidenceIds = replaceEvidenceIds(contradiction.evidenceIds, evidenceIdMap);
    contradiction.resolutionEvidenceIds = replaceEvidenceIds(contradiction.resolutionEvidenceIds, evidenceIdMap);
  }
  for (const competency of frozen.competencies) {
    competency.evidenceIds = replaceEvidenceIds(competency.evidenceIds, evidenceIdMap);
    competency.contradictoryEvidence = replaceEvidenceIds(competency.contradictoryEvidence, evidenceIdMap);
  }
  for (const trace of frozen.traces) {
    if (trace.turnId) trace.turnId = turnIdMap.get(trace.turnId) ?? trace.turnId;
  }
  return frozen;
}

function fixtureFingerprint(value: Omit<FrozenReportCase, "fixtureFingerprint">): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function buildFrozenReportCases(profile: ModelProfileName): FrozenReportCase[] {
  const state = createInterviewState(`frozen-${profile}`, "llm_application_engineer", createFixtureCandidate(profile));
  const cases: FrozenReportCase[] = [];
  activateInterview(state);
  applyInterviewDecision(state, uniqueDemoDecision(state));
  while (state.status === "active" && !state.openFloor) {
    const response = fixedProfileResponse(profile, state);
    const item = {
      id: `${profile}:${cases.length}`,
      profile,
      state: deterministicState(state, profile),
      answer: response.answer,
      expectedAnswerDisposition: response.disposition,
      expectedEvidence: structuredClone(response.evidence),
      expectedFieldIds: [...new Set(response.evidence.flatMap((item) => item.reportFieldIds))].sort(),
      expectedClaimIds: [...new Set(response.evidence.flatMap((item) => item.claimIds))].sort(),
    };
    cases.push({ ...item, fixtureFingerprint: fixtureFingerprint(item) });
    const record = recordAnswer(state, response.answer, response.evidence, response.disposition);
    applyInterviewDecision(state, uniqueDemoDecision(state), record.turn.id);
  }
  return cases;
}

export function buildAllFrozenReportCases(): FrozenReportCase[] {
  return (Object.keys(modelProfiles) as ModelProfileName[]).flatMap(buildFrozenReportCases);
}
