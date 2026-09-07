import type { Claim, DepthLevel, InterviewState, InterviewTurn, Lead, LeadProposal } from "./types.ts";
export function interviewTimeBudgetExhausted(state: Pick<InterviewState, "startedAt" | "timeBudgetMinutes">, now = Date.now()): boolean {
  return Boolean(state.startedAt && state.timeBudgetMinutes && now - Date.parse(state.startedAt) >= state.timeBudgetMinutes * 60_000);
}
export function answerTurnCount(state: InterviewState): number { return state.turns.filter((turn) => turn.kind !== "supplement").length; }
export function fieldConclusion(state: InterviewState, fieldId: string) {
  const evidence = state.evidence.filter((item) => item.reportFieldIds.includes(fieldId));
  const depths = evidence.filter((item) => item.polarity === "support" && item.depthLevel !== undefined).map((item) => item.depthLevel!);
  const reachedDepth = depths.length ? Math.max(...depths) as DepthLevel : undefined;
  const boundary = evidence.find((item) => item.polarity === "weakness" && item.depthLevel !== undefined && item.depthLevel > (reachedDepth ?? 0));
  return {
    supportStatements: [...new Set(evidence.filter((item) => item.polarity === "support").map((item) => item.statement))],
    weaknessStatements: [...new Set(evidence.filter((item) => item.polarity === "weakness").map((item) => item.statement))],
    invalidateStatements: [...new Set(evidence.filter((item) => item.polarity === "invalidate").map((item) => item.statement))],
    reachedDepth,
    boundaryReason: boundary ? { depthLevel: boundary.depthLevel!, sourceQuote: boundary.sourceQuote, evidenceId: boundary.id } : undefined,
  };
}
export function projectLeads(state: InterviewState) {
  return (state.leads ?? []).map((lead) => {
    const decision = state.traces.find((trace) => trace.followsLeadId === lead.id);
    return { ...lead, status: decision ? "followed" as const : state.status === "completed" ? "dropped" as const : "open" as const,
      followedByDecisionIndex: decision ? state.traces.indexOf(decision) : undefined };
  });
}
export function prepareLeads(state: InterviewState, proposals: readonly LeadProposal[], turn: InterviewTurn): Lead[] {
  if (proposals.length > 5) throw new Error("At most five grounded leads per answer");
  const result: Lead[] = [];
  for (const lead of proposals) {
    if (!lead.text.trim() || lead.text.length > 120 || !turn.answer.includes(lead.text)) throw new Error("Lead must quote the current answer verbatim");
    if (lead.suggestedFieldId && !state.report.fields.some((field) => field.id === lead.suggestedFieldId && field.projectId === turn.projectId)) throw new Error("Lead targets another project");
    if ([...(state.leads ?? []), ...result].some((item) => item.projectId === turn.projectId && item.text === lead.text)) continue;
    result.push({ ...lead, id: globalThis.crypto.randomUUID(), turnId: turn.id, projectId: turn.projectId! });
  }
  return result;
}
export function groundedAnswerClaims(state: InterviewState, projectId: string): Claim[] {
  const competencies = new Set(state.report.fields.filter((field) => field.projectId === projectId).map((field) => field.competencyId));
  return state.evidence.filter((item) => item.projectId !== projectId && item.polarity === "support" && competencies.has(item.competencyId))
    .map((item) => ({ id: `answer:${item.id}:${projectId}`, source: "candidate_answer", sourceEvidenceId: item.id,
      text: item.statement, sourceQuote: item.sourceQuote, projectId, status: "unverified", relatedCompetencies: [item.competencyId],
      supportingEvidenceIds: [], weakEvidenceIds: [], contradictingEvidenceIds: [] }));
}
