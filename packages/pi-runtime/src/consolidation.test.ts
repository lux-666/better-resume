import assert from "node:assert/strict";
import test from "node:test";
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { activateInterview, createFixtureCandidate, createInterviewState } from "../../interview-core/src/index.ts";
import { buildSummary } from "../../interview-core/src/memory.ts";
import { decideNextStepWithAgent, ModelProviderError, TelemetryCollector, withOneProviderRetry } from "./index.ts";
import { runtime } from "./test-helpers.ts";
test("scripted test runtimes preserve response order and isolate concurrent callers", async () => {
  const first = runtime([["first", { source: "a" }], ["second", { source: "a" }]]);
  const other = runtime([["independent", { source: "b" }]]);
  const invoke = async (value: ReturnType<typeof runtime>) => {
    const result = await value.streamFn(value.model, { messages: [] }).result();
    assert.equal(result.stopReason, "toolUse");
    return result.content.filter((item) => item.type === "toolCall").map(({ name, arguments: args }) => [name, args]);
  };
  assert.deepEqual(await Promise.all([invoke(first), invoke(other)]), [
    [["first", { source: "a" }]], [["independent", { source: "b" }]],
  ]);
  assert.deepEqual(await invoke(first), [["second", { source: "a" }]]);
});
test("the summary recorded in telemetry is the projection sent to the model, never the legacy cache", async () => {
  const state = createInterviewState("summary", "role", createFixtureCandidate()); activateInterview(state);
  const legacy = { ...state, memory: { summary: { version: 999, text: "FORGED_CACHE" } } };
  const before = JSON.stringify(legacy); const telemetry = new TelemetryCollector(); const contexts: string[] = [];
  const faux = fauxProvider(); const models = createModels(); models.setProvider(faux.provider);
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("read_report", {}), { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxToolCall("ask_candidate", { targetFieldId: "project_enterprise_rag:ownership", reason: "check ownership", question: "你具体负责了哪一部分？" }), { stopReason: "toolUse" }),
  ]);
  await decideNextStepWithAgent({ state: legacy, telemetry, memory: { recall: async () => [] }, model: faux.getModel(),
    streamFn: (...args) => { contexts.push(JSON.stringify(args[1])); return models.streamSimple(...args); } });
  assert.equal(JSON.stringify(legacy), before); assert.ok(contexts.length > 0); assert.doesNotMatch(contexts.join("\n"), /FORGED_CACHE/);
  const expected = buildSummary(state); const span = telemetry.trace.spans.find((s) => s.summary)!;
  assert.deepEqual(span.summary, { version: expected.version, sourceStateVersion: expected.sourceStateVersion, chars: JSON.stringify(expected).length, truncated: expected.truncated });
  const sent = JSON.parse(contexts[0]).messages.find((m: { role: string }) => m.role === "user");
  assert.deepEqual(JSON.parse(sent.content.find((c: { type: string }) => c.type === "text").text).summary, expected);
});
test("recent context excludes the latest answer and retains preceding turns", async () => {
  for (const useMemory of [true, false]) for (const count of [0, 1, 2, 3, 6]) {
    const state = createInterviewState("context", "role", createFixtureCandidate()); activateInterview(state);
    state.turns = Array.from({ length: count }, (_, index) => ({
      id: `turn-${index}`, index, question: `question-${index}`, answer: `answer-${index}`,
      timestamp: "2026-09-09T00:00:00Z",
    }));
    const scripted = runtime([["read_report", {}], ...(useMemory ? [["recall", { query: "earlier work", scope: "both" }] as [string, object]] : []), ["ask_candidate", {
      targetFieldId: "project_enterprise_rag:ownership", reason: "check ownership", question: "你具体负责了哪一部分？",
    }]]);
    const contexts: string[] = [];
    let excluded: string[] | undefined;
    await decideNextStepWithAgent({ state, ...scripted, ...(useMemory ? { memory: { recall: async (_state: unknown, _query: unknown, context: { excludedTurnIds?: string[] }) => { excluded = context.excludedTurnIds; return []; } } } : {}),
      streamFn: (...args) => { contexts.push(JSON.stringify(args[1])); return scripted.streamFn(...args); } });
    const input = JSON.parse(JSON.parse(contexts[0]).messages.find((m: { role: string }) => m.role === "user").content[0].text);
    assert.equal(input.latestAnswer, count ? `answer-${count - 1}` : undefined);
    assert.equal(input.latestQuestion, count ? `question-${count - 1}` : undefined);
    const expected = Array.from({ length: Math.min(Math.max(count - 1, 0), useMemory ? 2 : 4) }, (_, i) =>
      `answer-${Math.max(0, count - 1 - (useMemory ? 2 : 4)) + i}`);
    assert.deepEqual(input.recentTurns.map((turn: { answer: string }) => turn.answer), expected);
    if (useMemory) assert.deepEqual(excluded, [...expected.map((answer) => answer.replace("answer-", "turn-")), ...(count ? [`turn-${count - 1}`] : [])]);
  }
});
test("shared provider retry never repeats aborted work or returns a late accepted result", async () => {
  const abort = new AbortController(); let calls = 0;
  await assert.rejects(withOneProviderRetry(async () => { calls++; abort.abort(new Error("cancelled")); throw new ModelProviderError("offline"); }, undefined, abort.signal), /cancelled/);
  assert.equal(calls, 1);
  const late = new AbortController(); await assert.rejects(withOneProviderRetry(async () => { late.abort(new Error("late")); return "result"; }, undefined, late.signal), /late/);
});
