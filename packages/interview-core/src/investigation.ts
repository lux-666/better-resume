import type { Claim, DepthLevel, InterviewState, InterviewTurn, Lead, LeadProposal } from "./types.ts";
export function interviewTimeBudgetExhausted(state: Pick<InterviewState, "startedAt" | "timeBudgetMinutes">, now = Date.now()): boolean {
  return Boolean(state.startedAt && state.timeBudgetMinutes && now - Date.parse(state.startedAt) >= state.timeBudgetMinutes * 60_000);
}
export function interviewTurnLimit(state: Pick<InterviewState, "maxTurns">): number { return state.maxTurns ?? 15; }
export function answerTurnCount(state: InterviewState): number { return state.turns.filter((turn) => turn.kind !== "supplement").length; }
const normalizedAnswer = (text: string) => text.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
export function projectPauseReason(state: InterviewState, projectId: string): string | undefined {
  const turns = state.turns.filter((turn) => turn.projectId === projectId && turn.kind !== "supplement").slice(-2);
  const latest = turns.at(-1);
  if (!latest) return;
  const clauses = latest.answer.split(/[，。！？；\n]/).map((text) => text.trim());
  if (clauses.some((text) => /^(?:我(?:想|希望)?|我们|咱们|能不能|可以|请|还是|要不|那)?(?:先|直接)?(?:换(?:一?个|下一个|另一个|其他|其它)?|(?:聊|说)(?:下一个|另一个|其他|其它))(?:项目|经历|话题)/.test(text)
    || /^(?:这个|这段|该)(?:项目|经历)(?:我)?(?:都|已经|实在|真的)?(?:记不清|说不清|不了解|不清楚|不想聊|不想继续|没什么可补充)/.test(text))) return "候选人希望换话题，或明确表示无法继续展开这个项目。";
  if (turns.length === 2 && (turns.every((turn) => turn.disposition === "vague" || turn.disposition === "skip_request"
    || /^(?:我)?(?:也|都|实在|真的)?(?:不清楚|不知道|记不清|说不清|忘了|没有保留|不记得)(?:了|细节|具体细节)?$/.test(normalizedAnswer(turn.answer)))
    || normalizedAnswer(turns[0].answer) === normalizedAnswer(turns[1].answer))) return "连续两次回答没有提供新的可展开信息，暂停该项目。";
}
export function saturatedFieldIds(state: InterviewState): string[] {
  return state.report.fields.flatMap((field) => {
    const turns = state.turns.filter((turn) => turn.reportFieldId === field.id).slice(-2);
    return turns.some((turn) => turn.disposition === "skip_request") || (turns.length === 2 &&
      (normalizedAnswer(turns[0].answer) === normalizedAnswer(turns[1].answer) || turns.every((turn) => turn.disposition === "vague"))) ? [field.id] : [];
  });
}
export function projectInvestigationBlockers(state: InterviewState, projectId: string): string[] {
  if (projectPauseReason(state, projectId)) return [];
  const fields = state.report.fields.filter((field) => field.projectId === projectId);
  const saturated = new Set(saturatedFieldIds(state));
  const blockers = fields.filter((field) => field.importance >= .8 && field.status === "missing" && !saturated.has(field.id))
    .map((field) => `${field.id}: ${field.description}`);
  if (state.phaseVersion === 3 && !fields.some((field) => (fieldConclusion(state, field.id).reachedDepth ?? 0) >= 3)
    && fields.some((field) => !saturated.has(field.id))) {
    blockers.push(`${projectId}: explore a concrete decision and its rationale before leaving this project`);
  }
  blockers.push(...state.report.contradictions.filter((item) => item.projectId === projectId && item.status === "open")
    .map((item) => `${item.id}: unresolved contradiction`));
  return blockers;
}
export function validateProjectSwitch(state: InterviewState, targetFieldId: string): void {
  const current = state.turns.findLast((turn) => turn.kind !== "supplement")?.projectId;
  const target = state.report.fields.find((field) => field.id === targetFieldId);
  if (target && projectPauseReason(state, target.projectId)) throw new Error("Candidate reached a boundary in this project; choose another project or invite open discussion");
  if (!current || !target || current === target.projectId) return;
  // A newly discovered contradiction may need clarification in an earlier project immediately.
  if (target.status === "contradicted" && state.report.contradictions.some((item) => item.projectId === target.projectId && item.status === "open")) return;
  const blockers = projectInvestigationBlockers(state, current);
  if (blockers.length) throw new Error(`Continue the current project before switching: ${blockers.join("; ")}`);
}
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
