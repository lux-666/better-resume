import type { StreamFn } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { Check } from "typebox/value";
import { validateCandidateAside, type InterviewState } from "../../interview-core/src/index.ts";
import { createObservedAgent, runObservedAgent } from "./agent-runner.ts";
import { EvidenceValidationError, ModelProviderError } from "./index.ts";
import type { TelemetryCollector } from "./telemetry.ts";
export async function clarifyWithAgent(options: { model: Model<Api>; streamFn: StreamFn; state: InterviewState; request: string;
  telemetry: TelemetryCollector; signal?: AbortSignal; attempt?: number }): Promise<string> {
  const schema = Type.Object({ clarification: Type.String({ minLength: 1, maxLength: 300 }) }, { additionalProperties: false });
  let accepted: string | undefined;
  let failures = 0;
  const agent = createObservedAgent({ ...options, operation: "interview_agent",
    prompt: "用简短中文解释当前问题的含义或范围，不换题、不提出另一个问题，不透露预期答案或内部评估标准。没有候选人尚未提供的岗位或项目信息。只调用 clarify_candidate。",
    tools: [{ name: "clarify_candidate", label: "Clarify current question", description: "Explain the existing question without asking a new one.", parameters: schema,
      execute: async (_, value) => {
        if (!Check(schema, value)) throw new EvidenceValidationError("Invalid clarification");
        validateCandidateAside(value.clarification); accepted = value.clarification;
        return { content: [{ type: "text", text: "Clarification accepted" }], details: {}, terminate: true };
      } }] });
  agent.shouldStopAfterTurn = ({ toolResults }) => { failures += toolResults.filter((result) => result.isError).length; return failures >= 2; };
  return runObservedAgent(agent, JSON.stringify({ question: options.state.currentQuestion, request: options.request }), () => {
    if (!accepted) { if (agent.state.errorMessage) throw new ModelProviderError("Clarification provider failed"); throw new EvidenceValidationError("No accepted clarification"); }
    return accepted;
  }, options.signal);
}
