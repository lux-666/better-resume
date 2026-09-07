import { createLegacyInterviewRole, normalizeInterviewIntake, type InterviewState } from "../../../packages/interview-core/src/index.ts";
export function discardLegacySummary(state: InterviewState): InterviewState {
  // Applies to both stored State and immutable command replay payloads.
  delete (state as InterviewState & { memory?: unknown }).memory;
  return state;
}
export function hydrateState(state: InterviewState): InterviewState {
  discardLegacySummary(state);
  if (!state.role) state.role = createLegacyInterviewRole(state.roleId, state.candidate);
  state.intake = normalizeInterviewIntake({
    candidate: {
      name: state.intake?.candidate?.name ?? state.candidate.name,
      skills: state.intake?.candidate?.skills ?? state.candidate.skills,
      projects: state.candidate.projects.map((project, index) => ({
        name: state.intake?.candidate?.projects?.[index]?.name ?? project.name,
        description: state.intake?.candidate?.projects?.[index]?.description ?? project.description,
      })),
    },
    ...(state.intake?.job ? { job: state.intake.job } : {}),
  });
  return state;
}

export function stateVersion(state: InterviewState): number { return state.traces.length; }
export function questionId(state: InterviewState): string | undefined {
  return state.currentQuestion ? `${state.sessionId}:${stateVersion(state)}` : undefined;
}
