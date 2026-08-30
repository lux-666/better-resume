import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { Type, type Static } from "typebox";
import { Check } from "typebox/value";
import type { InterviewState } from "../../interview-core/src/index.ts";

type AgentOptions = ConstructorParameters<typeof Agent>[0];

export const EvidenceExtractionSchema = Type.Object({
  evidence: Type.Array(Type.Object({
    claimIds: Type.Array(Type.String({ minLength: 1 }), { uniqueItems: true }),
    competencyId: Type.String({ minLength: 1 }),
    statement: Type.String({ minLength: 1 }),
    polarity: Type.Union([
      Type.Literal("support"),
      Type.Literal("weakness"),
      Type.Literal("invalidate"),
    ]),
    strength: Type.Number({ minimum: 0, maximum: 1 }),
    specificity: Type.Number({ minimum: 0, maximum: 1 }),
    evaluatorConfidence: Type.Number({ minimum: 0, maximum: 1 }),
    sourceQuote: Type.String({ minLength: 1 }),
  }, { additionalProperties: false })),
}, { additionalProperties: false });

export type EvidenceExtraction = Static<typeof EvidenceExtractionSchema>;

export class EvidenceValidationError extends Error {
  override name = "EvidenceValidationError";
}

export function validateEvidenceExtraction(
  value: unknown,
  context: { answer: string; claimIds: readonly string[]; competencyIds: readonly string[] },
): EvidenceExtraction {
  if (!Check(EvidenceExtractionSchema, value)) {
    throw new EvidenceValidationError("Evidence output does not match the schema");
  }
  const claimIds = new Set(context.claimIds);
  const competencyIds = new Set(context.competencyIds);
  for (const evidence of value.evidence) {
    if (evidence.claimIds.some((id) => !claimIds.has(id))) {
      throw new EvidenceValidationError("Evidence references an unknown claim");
    }
    if (!competencyIds.has(evidence.competencyId)) {
      throw new EvidenceValidationError("Evidence references an unknown competency");
    }
    if (!context.answer.includes(evidence.sourceQuote)) {
      throw new EvidenceValidationError("Evidence sourceQuote is not verbatim from the answer");
    }
  }
  return value;
}

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
