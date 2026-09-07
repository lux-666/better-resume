import { createCandidateReport, type InterviewState, type InterviewTurn } from "./index.ts";
import { plannedFields } from "./role-pack.ts";

export type OpenFloorReply = { kind: "topic" | "question" | "done"; title?: string; response?: string };

export function addCandidateTopic(state: InterviewState, answer: string, title: string): string {
  if (!state.openFloor || !title.trim() || !answer.includes(title)) throw new Error("New topic must quote the candidate's invitation reply");
  const id = `candidate-topic-${crypto.randomUUID()}`;
  const project = { id, name: title, description: answer, claims: [], technologies: [], outcomes: [], mappedCompetencies: state.role.competencies.map((c) => c.id) };
  state.candidate.projects.push(project);
  state.report.fields.push(...(state.rolePack ? plannedFields(state, state.rolePack).filter((f) => f.projectId === id)
    : createCandidateReport({ ...state.candidate, projects: [project] }).fields));
  state.openFloor = false;
  return id;
}

export function recordDiscussion(state: InterviewState, answer: string, response?: string): InterviewTurn {
  if (!state.openFloor || !state.currentQuestion || !answer.trim()) throw new Error("No candidate discussion is active");
  const turn: InterviewTurn = { id: crypto.randomUUID(), index: state.turns.length, kind: "discussion", question: state.currentQuestion,
    answer: answer.trim(), interviewerResponse: response, timestamp: new Date().toISOString() };
  state.turns.push(turn);
  return turn;
}

// ponytail: demo recognizes common closing phrases; configured interviews use model intent recognition.
export function demoOpenFloorReply(answer: string): OpenFloorReply {
  if (/^(没有了?|没什么(了)?|暂时没有|不用了|结束(面试)?|可以结束了|没有(其他|更多)?(问题|补充)(了)?)[。！!\s]*$/.test(answer.trim())) return { kind: "done" };
  if (/[?？]|想问|请问/.test(answer)) return { kind: "question", response: "当前是演示模式，无法针对这条问题生成回答。你可以继续补充经历，或结束交流；启用模型后会结合岗位和对话回答。" };
  return { kind: "topic", title: answer.trim().slice(0, 60) };
}
