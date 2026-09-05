import assert from "node:assert/strict";
import test from "node:test";
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { activateInterview, applyInterviewDecision, createFixtureCandidate, createInterviewState } from "../../interview-core/src/index.ts";
import { buildInterviewAgentView, buildReportAgentView, decideNextStepWithAgent, TelemetryCollector, validateReportEdit } from "./index.ts";
import type { ProbeKnowledge } from "./knowledge.ts";
const ask = { targetFieldId: "project_enterprise_rag:mechanism", reason: "核验融合取舍", question: "你当时为什么选择这种融合方式？" };
function runtime(calls: Array<[string, object]>) {
  const faux = fauxProvider(); const models = createModels(); models.setProvider(faux.provider);
  faux.setResponses(calls.map(([name, value]) => fauxAssistantMessage(fauxToolCall(name, value), { stopReason: "toolUse" })));
  return { model: faux.getModel(), streamFn: models.streamSimple.bind(models) };
}
function state() { const state = createInterviewState("session", "role", createFixtureCandidate("Candidate")); activateInterview(state); return state; }
test("Agent explicitly retrieves, references only hits and persists provenance without candidate evidence", async () => {
  const current = state(); const telemetry = new TelemetryCollector(); let queries = 0;
  const knowledge: ProbeKnowledge = { health: () => ({ status: "ready", count: 1 }), retrieve: async (query, context) => {
    queries++;
    const hits = [{ id: "rag", kind: "competency", text: "knowledge-only-marker", score: 1, sourcePath: "rag.md" }];
    const span = context!.telemetry!.start("retrieve_probe_knowledge", "retrieval", undefined, { retrieval: { ...query, hits, referencedIds: [] } });
    context!.telemetry!.finish(span); return hits;
  } };
  const decision = await decideNextStepWithAgent({ ...runtime([["read_report", {}], ["retrieve_probe_knowledge", { query: "融合" }],
    ["ask_candidate", { ...ask, knowledgeIds: ["invented"] }], ["ask_candidate", { ...ask, knowledgeIds: ["rag"] }]]), state: current, telemetry, knowledge });
  assert.equal(queries, 1); assert.deepEqual(decision.knowledgeIds, ["rag"]);
  applyInterviewDecision(current, decision);
  assert.deepEqual(current.traces.at(-1)!.knowledgeIds, ["rag"]);
  assert.deepEqual(telemetry.trace.spans.find((span) => span.retrieval)!.retrieval!.referencedIds, ["rag"]);
  assert.equal(current.evidence.length, 0);
  assert.doesNotMatch(JSON.stringify(buildReportAgentView(current)), /knowledge-only-marker/);
  assert.equal((buildInterviewAgentView(current, knowledge) as { playbook?: string }).playbook, undefined);
  assert.throws(() => validateReportEdit({ answerDisposition: "substantive", evidence: [{ reportFieldIds: ["f"], claimIds: [], competencyId: "c", statement: "knowledge-only-marker", sourceQuote: "knowledge-only-marker", polarity: "support", strength: 1, specificity: 1, evaluatorConfidence: 1 }] }, { answer: "我做了召回模块", claimIds: [], fields: [{ id: "f", competencyId: "c" }] }));
});
test("retrieval failures and a spent per-turn budget still allow asking with static fallback", async () => {
  let queries = 0;
  const knowledge: ProbeKnowledge = { health: () => ({ status: "ready", count: 1 }), retrieve: async () => { queries++; throw new Error("provider unavailable"); } };
  const current = state();
  const result = await decideNextStepWithAgent({ ...runtime([["read_report", {}], ["retrieve_probe_knowledge", { query: "RAG" }],
    ["retrieve_probe_knowledge", { query: "RAG" }], ["retrieve_probe_knowledge", { query: "RAG" }], ["ask_candidate", ask]]),
    state: current, knowledge, retrievalBudget: { remaining: 2 } });
  assert.equal(queries, 2); assert.equal(result.action, "ASK_CANDIDATE"); assert.equal(result.knowledgeIds, undefined);
});
