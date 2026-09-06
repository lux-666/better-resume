import type { InterviewState } from "./types.ts";
import type { InterviewSummary } from "./phase4-schema.ts";
import { fieldConclusion, projectLeads } from "./investigation.ts";
export function buildSummary(state: InterviewState): InterviewSummary {
  const summary: InterviewSummary = { version: state.turns.length, sourceStateVersion: state.traces.length, charBudget: 1500, truncated: false,
    candidateStyle: `已回答${state.turns.length}轮；主动澄清${state.clarifications?.length ?? 0}次。`, perProject: [] };
  const fits = () => JSON.stringify(summary).length <= 1500;
  const leads = projectLeads(state);
  for (const project of state.candidate.projects) {
    const part: InterviewSummary["perProject"][number] = { projectId: project.id, coveredDepth: {}, keyStatements: [], openLeads: [], contradictions: [] };
    summary.perProject.push(part);
    if (!fits()) { summary.perProject.pop(); summary.truncated = true; break; }
    for (const field of state.report.fields.filter((field) => field.projectId === project.id)) {
      part.coveredDepth[field.id.split(":").at(-1)!] = fieldConclusion(state, field.id).reachedDepth ?? 0;
      if (!fits()) { delete part.coveredDepth[field.id.split(":").at(-1)!]; summary.truncated = true; }
    }
  }
  // Round-robin retains early evidence across projects; recall provides the omitted detail.
  for (let rank = 0; rank < 5; rank++) for (const part of summary.perProject) {
    const evidence = state.evidence.filter((e) => e.projectId === part.projectId)[rank];
    if (!evidence) continue;
    const turn = state.turns.find((turn) => turn.id === evidence.turnId);
    if (!turn?.answer.includes(evidence.sourceQuote)) continue;
    part.keyStatements.push({ text: evidence.sourceQuote.slice(0, 100), evidenceId: evidence.id });
    if (!fits()) { part.keyStatements.pop(); summary.truncated = true; }
  }
  for (const part of summary.perProject) {
    for (const lead of leads.filter((lead) => lead.projectId === part.projectId && lead.status === "open").slice(-5)) {
      part.openLeads.push(lead.id); if (!fits()) { part.openLeads.pop(); summary.truncated = true; }
    }
    for (const conflict of state.report.contradictions.filter((c) => c.projectId === part.projectId && c.status === "open")) {
      part.contradictions.push(conflict.id); if (!fits()) { part.contradictions.pop(); summary.truncated = true; }
    }
  }
  if (state.evidence.some((e) => e.sourceQuote.length > 100) || summary.perProject.some((p) => state.evidence.filter((e) => e.projectId === p.projectId).length > p.keyStatements.length || leads.filter((l) => l.projectId === p.projectId && l.status === "open").length > p.openLeads.length)) summary.truncated = true;
  return summary;
}
