import assert from "node:assert/strict";
import test from "node:test";
import { createModels, fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import { configuredReranker, rerankWithModel } from "./rerank.ts";
test("mini reranking makes one model request, preserves index order and rejects malformed scores", async () => {
  const faux = fauxProvider(), models = createModels(); models.setProvider(faux.provider);
  const runtime = { mode: "llm" as const, model: faux.getModel(), streamFn: models.streamSimple.bind(models) };
  const signal = new AbortController().signal;
  faux.setResponses([(context) => {
    assert.equal(context.tools, undefined);
    assert.equal(context.messages.length, 1);
    assert.deepEqual(JSON.parse(context.messages[0].content as string), { query: "q", documents: [{ index: 0, text: "a" }, { index: 1, text: "b" }] });
    return fauxAssistantMessage('```json\n{"scores":[{"index":1,"score":0.9},{"index":0,"score":0.1}]}\n```');
  }]);
  assert.deepEqual(await rerankWithModel(runtime, "q", ["a", "b"], signal), [.1, .9]);
  assert.equal(faux.state.callCount, 1);
  for (const scores of [[], [{ index: 0, score: .1 }, { index: 0, score: .2 }], [{ index: 0, score: .1 }, { index: 2, score: .2 }], [{ index: 0, score: .1 }, { index: 1, score: 2 }]]) {
    faux.setResponses([fauxAssistantMessage(JSON.stringify({ scores }))]);
    await assert.rejects(rerankWithModel(runtime, "q", ["a", "b"], signal));
  }
  assert.equal(configuredReranker({}), undefined);
  assert.throws(() => configuredReranker({ LLM_MINI_MODEL: "mini", LLM_RERANK_TIMEOUT_SECONDS: "0" }));
  await assert.rejects(rerankWithModel(runtime, "q", ["a"], AbortSignal.abort()));
});
