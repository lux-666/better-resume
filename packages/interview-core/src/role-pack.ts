import { requirementLines } from "./intake.ts";
import { Check } from "typebox/value";
import { RolePackSchema, type RolePack, type RequirementMatrix } from "./phase4-schema.ts";
import type { InterviewState, ReportField } from "./types.ts";
import { fieldConclusion } from "./investigation.ts";
const generic = ["ownership", "mechanism", "measurement", "failure"];
export function jdLines(state: InterviewState): string[] { return requirementLines(state.intake.job?.requirements); }
function plannedFields(state: InterviewState, pack: RolePack): ReportField[] {
  return state.candidate.projects.flatMap((project) => pack.fieldPlan.filter((plan) => plan.appliesToProjects === "all" || plan.requirementIds.some((id) => pack.projectRelevance[project.id]?.includes(id))).map((plan) => ({
    id: `${project.id}:${plan.fieldKind}`, projectId: project.id, competencyId: plan.competencyId, name: plan.name,
    description: pack.requirements.filter((r) => plan.requirementIds.includes(r.id)).flatMap((r) => [r.text, ...r.verifiableSignals]).join("；") || state.report.fields.find((f) => f.id === `${project.id}:${plan.fieldKind}`)?.description || plan.name,
    importance: plan.requirementIds.some((id) => pack.requirements.some((r) => r.id === id && r.priority === "must")) ? 1 : plan.importance,
    requirementIds: plan.requirementIds, status: "missing" as const, evidenceIds: [],
  })));
}
export function validateRolePack(value: unknown, state: InterviewState): RolePack {
  if (!Check(RolePackSchema, value)) throw new Error("Role Pack structure is invalid");
  const lines = jdLines(state);
  if (lines.length !== value.requirements.length || value.requirements.some((r) => !lines.includes(r.text)) || new Set(value.requirements.map((r) => r.text)).size !== lines.length) throw new Error("Requirements must cover every verbatim JD line exactly once");
  for (const items of [value.requirements, value.competencies]) if (new Set(items.map((item) => item.id)).size !== items.length) throw new Error("Duplicate IDs in Role Pack");
  if (Math.abs(value.competencies.reduce((sum, c) => sum + c.weight, 0) - 1) > .001 || state.role.competencies.some((c) => !value.competencies.some((item) => item.id === c.id))) throw new Error("Keep generic competencies and weights summing to one");
  if (new Set(value.fieldPlan.map((p) => p.fieldKind)).size !== value.fieldPlan.length || generic.some((kind) => !value.fieldPlan.some((p) => p.fieldKind === kind && p.appliesToProjects === "all"))) throw new Error("Keep four generic fields for all projects");
  if (generic.some((kind) => {
    const original = state.report.fields.find((f) => f.id.endsWith(`:${kind}`));
    return value.fieldPlan.find((p) => p.fieldKind === kind)!.competencyId !== original?.competencyId;
  })) throw new Error("Keep generic field competency mappings");
  const competencyIds = new Set(value.competencies.map((c) => c.id)); const requirementIds = new Set(value.requirements.map((r) => r.id));
  if (value.requirements.some((r) => !competencyIds.has(r.competencyId)) || value.fieldPlan.some((p) => !competencyIds.has(p.competencyId) || p.requirementIds.some((id) => !requirementIds.has(id) || value.requirements.find((r) => r.id === id)!.competencyId !== p.competencyId))) throw new Error("Unknown or incompatible requirement mapping");
  const projectIds = new Set(state.candidate.projects.map((p) => p.id));
  if (Object.keys(value.projectRelevance).some((id) => !projectIds.has(id)) || Object.values(value.projectRelevance).flat().some((id) => !requirementIds.has(id))) throw new Error("Unknown project relevance reference");
  const fields = plannedFields(state, value);
  if (state.candidate.projects.some((p) => fields.filter((f) => f.projectId === p.id).length > 7) || fields.length > Math.max(18, state.candidate.projects.length * 4)) throw new Error("Too many investigation fields");
  if (value.requirements.some((r) => !fields.some((f) => f.requirementIds?.includes(r.id)))) throw new Error("Every requirement needs an investigation field");
  return value;
}
export function applyRolePack(state: InterviewState, pack: RolePack): void {
  if (state.status !== "draft" || state.turns.length) throw new Error("Role Pack is frozen before interviewing");
  validateRolePack(pack, state); state.rolePack = pack; state.role.competencies = pack.competencies; state.role.requirements = pack.requirements.map((r) => r.text);
  state.report.fields = plannedFields(state, pack);
  for (const project of state.candidate.projects) project.mappedCompetencies = [...new Set(state.report.fields.filter((f) => f.projectId === project.id).map((f) => f.competencyId))];
}
export function requirementMatrix(state: InterviewState): RequirementMatrix {
  return (state.rolePack?.requirements ?? []).map((r) => {
    const fields = state.report.fields.filter((f) => f.requirementIds?.includes(r.id));
    const evidenceIds = [...new Set(fields.flatMap((f) => f.evidenceIds))];
    const depth = Math.max(0, ...fields.map((f) => fieldConclusion(state, f.id).reachedDepth ?? 0));
    const supported = fields.some((f) => f.status === "supported");
    const status = fields.some((f) => f.status === "contradicted") ? "contradicted" : supported && fields.some((f) => f.status === "supported" && (fieldConclusion(state, f.id).reachedDepth ?? 0) >= 3) ? "supported" : supported ? "partial" : fields.some((f) => f.status === "weak") ? "weak" : "not_investigated";
    return { requirementId: r.id, text: r.text, priority: r.priority, status, ...(depth ? { reachedDepth: depth } : {}), evidenceIds, projectIds: [...new Set(fields.map((f) => f.projectId))] };
  });
}
