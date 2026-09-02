import type { InterviewState } from "../../../packages/interview-core/src/index.ts";
import { modelProfiles, type ModelProfileName } from "../../../packages/interview-core/src/fixed-profiles.ts";
import type { ReportEdit } from "../../../packages/pi-runtime/src/index.ts";

export type GateSeverity = "critical" | "major";

export interface EvaluationTurn {
  index: number;
  retryCount: number;
  question: string;
  targetFieldId?: string;
  reason: string;
  answer: string;
  edit: ReportEdit;
  rejectedFinishes: string[][];
}

export interface GateFailure {
  severity: GateSeverity;
  code: string;
  message: string;
  turnIndex?: number;
}

export function evaluateProfileRun(
  profile: ModelProfileName,
  state: InterviewState,
  turns: readonly EvaluationTurn[],
): GateFailure[] {
  const failures: GateFailure[] = [];
  const fields = new Map(state.report.fields.map((field) => [field.id, field]));
  const claimIds = new Set([
    ...state.candidate.claims,
    ...state.candidate.projects.flatMap((project) => project.claims),
  ].map((claim) => claim.id));

  for (const evidence of state.evidence) {
    const turn = state.turns.find((item) => item.id === evidence.turnId);
    if (!turn?.answer.includes(evidence.sourceQuote)) {
      failures.push({ severity: "critical", code: "ungrounded_quote", message: evidence.id });
    }
    if (evidence.claimIds.some((id) => !claimIds.has(id))) {
      failures.push({ severity: "critical", code: "unknown_claim", message: evidence.id });
    }
    if (evidence.reportFieldIds.some((id) => fields.get(id)?.competencyId !== evidence.competencyId)) {
      failures.push({ severity: "critical", code: "invalid_report_field", message: evidence.id });
    }
  }

  if (state.status === "completed") {
    for (const contradiction of state.report.contradictions.filter((item) => item.status === "open")) {
      failures.push({ severity: "critical", code: "open_contradiction", message: contradiction.id });
    }
    for (const field of state.report.fields.filter((item) => item.importance >= 0.8 && item.status === "missing")) {
      failures.push({ severity: "critical", code: "missing_required_field", message: field.id });
    }
  }
  if (state.turns.length > modelProfiles[profile].maxTurns) {
    failures.push({ severity: "critical", code: "turn_limit_exceeded", message: String(state.turns.length) });
  }

  const normalized = state.turns.map((turn) => turn.question.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, ""));
  const duplicate = normalized.findIndex((question, index) => normalized.indexOf(question) !== index);
  if (duplicate >= 0) {
    failures.push({ severity: "major", code: "duplicate_question", message: state.turns[duplicate].question,
      turnIndex: duplicate });
  }
  for (const turn of turns) {
    if (turn.edit.answerDisposition === "vague"
      && turn.edit.evidence.some((evidence) => evidence.polarity === "support")) {
      failures.push({ severity: "major", code: "vague_promoted", message: turn.answer, turnIndex: turn.index });
    }
    if (turn.edit.answerDisposition === "irrelevant" && turn.edit.evidence.length > 0) {
      failures.push({ severity: "critical", code: "irrelevant_evidence", message: turn.answer, turnIndex: turn.index });
    }
  }

  if (profile === "multi_field"
    && !turns.some((turn) => new Set(turn.edit.evidence.flatMap((evidence) => evidence.reportFieldIds)).size >= 3)) {
    failures.push({ severity: "major", code: "multi_field_missed", message: "No answer updated three report fields." });
  }
  if (profile === "vertical_depth") {
    const followed = turns.some((turn, index) => /hybrid search|RRF/i.test(turn.answer)
      && /hybrid|RRF|BM25|dense|融合|召回|稀疏|稠密|top.?k/i.test(turns[index + 1]?.question ?? ""));
    if (!followed) {
      failures.push({ severity: "major", code: "vertical_depth_missed",
        message: "No concrete retrieval lead was pursued in the next question." });
    }
  }
  if (profile === "evasive") {
    if (!turns.some((turn) => turn.edit.answerDisposition === "irrelevant")) {
      failures.push({ severity: "major", code: "irrelevant_case_missing", message: "No irrelevant answer observed." });
    }
    if (!turns.some((turn) => turn.edit.answerDisposition === "vague")) {
      failures.push({ severity: "major", code: "vague_case_missing", message: "No vague answer observed." });
    }
  }
  if (profile === "contradictory") {
    if (state.report.contradictions.length === 0) {
      failures.push({ severity: "major", code: "contradiction_case_missing", message: "No contradiction observed." });
    } else if (state.report.contradictions.some((item) => item.status === "open")) {
      failures.push({ severity: "critical", code: "contradiction_unresolved", message: "Contradiction remains open." });
    }
  }
  if (state.turns.length === 15 && state.report.fields.every((field) => field.status !== "missing")) {
    failures.push({ severity: "major", code: "ineffective_until_hard_limit",
      message: "The report was complete but the interview reached the hard limit." });
  }
  return failures;
}

export function minimalFailureTranscript(
  turns: readonly EvaluationTurn[],
  failure: GateFailure,
): Pick<EvaluationTurn, "index" | "question" | "answer" | "targetFieldId">[] {
  if (failure.turnIndex === undefined) return [];
  return turns.slice(Math.max(0, failure.turnIndex - 1), failure.turnIndex + 2).map((turn) => ({
    index: turn.index,
    question: turn.question,
    answer: turn.answer,
    targetFieldId: turn.targetFieldId,
  }));
}
