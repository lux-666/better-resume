import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import type { InterviewState } from "../../interview-core/src/index.ts";

type AgentOptions = ConstructorParameters<typeof Agent>[0];

export function createInterviewAgent(options: {
  model: NonNullable<AgentOptions["initialState"]>["model"];
  streamFn: AgentOptions["streamFn"];
  readState: () => InterviewState;
}): Agent {
  const getInterviewState: AgentTool = {
    name: "get_interview_state",
    label: "Get interview state",
    description: "Read the structured interview state. This tool cannot mutate state.",
    parameters: Type.Object({}),
    execute: async () => ({
      content: [{ type: "text", text: JSON.stringify(options.readState()) }],
      details: {},
    }),
  };
  return new Agent({
    initialState: {
      systemPrompt: [
        "You are an evidence-driven interviewer.",
        "Use only the provided interview tools; never assume resume claims are proven evidence.",
        "Ask one concise question at a time and do not reveal the rubric.",
      ].join("\n"),
      model: options.model,
      tools: [getInterviewState],
    },
    streamFn: options.streamFn,
    toolExecution: "sequential",
  });
}
