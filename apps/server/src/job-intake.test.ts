import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createModels, fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import { createApplication } from "./application.ts";
import { extractJobFields } from "./job-intake.ts";
import { HttpError } from "./http.ts";

test("JD intake sends complete OCR text once, returns editable fields without content checks, and reports failures", async () => {
  const faux = fauxProvider(); const models = createModels(); models.setProvider(faux.provider);
  const text = "09:41\nAI 工程师\n岗 位 职 责\n维护推理服务\n要求服务可用性达到 99.9%\n职位要求\n熟悉 Python";
  const expected = { title: "AI 工程师", introduction: "", responsibilities: "维护推理服务\n要求服务可用性达到 99.9%", requirements: "熟悉 Python" };
  faux.setResponses([
    (context) => {
      assert.equal(context.messages.length, 1);
      assert.equal(context.messages[0].content, text);
      assert.equal(context.tools, undefined);
      return fauxAssistantMessage("```json\n" + JSON.stringify(expected) + "\n```");
    },
    fauxAssistantMessage("invalid JSON"),
    fauxAssistantMessage("", { stopReason: "error", errorMessage: "unavailable" }),
  ]);
  const report = { mode: "llm" as const, model: faux.getModel(), streamFn: models.streamSimple.bind(models) };
  const app = createApplication({ databasePath: ":memory:", runtimes: { report, interview: { mode: "demo" }, info: { mode: "demo" } } });
  try {
    await app.ready; app.server.listen(0, "127.0.0.1"); await once(app.server, "listening");
    const address = app.server.address(); assert.ok(address && typeof address !== "string");
    const post = (body: object) => fetch(`http://127.0.0.1:${address.port}/api/intake/job`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    const success = await post({ text });
    assert.equal(success.status, 200); assert.deepEqual(await success.json(), expected);
    assert.equal(faux.state.callCount, 1); assert.deepEqual(app.store.history(), []);
    for (const body of [{}, { text: 42 }, { text: " " }, { text: "a".repeat(100_001) }]) assert.equal((await post(body)).status, 400);
    assert.equal(faux.state.callCount, 1);
    const malformed = await post({ text }); assert.equal(malformed.status, 502);
    assert.equal((await malformed.json() as { code: string }).code, "MODEL_OUTPUT_INVALID");
    assert.equal((await post({ text })).status, 503);
    await assert.rejects(extractJobFields(text, { mode: "demo" }, new AbortController().signal), /需要连接 LLM/);
  } finally { await app.close(); }
});

test("JD retries a terminated stream once and discards its partial fields", async () => {
  const faux = fauxProvider(); const models = createModels(); models.setProvider(faux.provider);
  const expected = { title: "数据工程实习生", introduction: "数据工程", responsibilities: "建设数据链路", requirements: "熟悉 Python" };
  const text = "数据工程实习生\n建设数据链路\n熟悉 Python";
  faux.setResponses([
    fauxAssistantMessage('{"title":"不完整', { stopReason: "error", errorMessage: "terminated" }),
    (context) => {
      assert.equal(context.messages.length, 1);
      assert.equal(context.messages[0].content, text);
      return fauxAssistantMessage(JSON.stringify(expected));
    },
  ]);
  const runtime = { mode: "llm" as const, model: faux.getModel(), streamFn: models.streamSimple.bind(models) };
  assert.deepEqual(await extractJobFields(text, runtime, new AbortController().signal), expected);
  assert.equal(faux.state.callCount, 2);
});

test("JD reports repeated disconnections without leaking provider details or retrying forever", async () => {
  const faux = fauxProvider(); const models = createModels(); models.setProvider(faux.provider);
  faux.setResponses(Array.from({ length: 2 }, () => fauxAssistantMessage("partial output", {
    stopReason: "error", errorMessage: "terminated: Authorization Bearer secret-key; private JD text",
  })));
  const runtime = { mode: "llm" as const, model: faux.getModel(), streamFn: models.streamSimple.bind(models) };
  await assert.rejects(extractJobFields("JD", runtime, new AbortController().signal), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.retryable, true);
    assert.match(error.message, /连接中断.*原表单未修改/);
    assert.doesNotMatch(error.message, /secret-key|private JD/);
    return true;
  });
  assert.equal(faux.state.callCount, 2);
});

test("JD does not retry rejected credentials or an expired deadline", async () => {
  const faux = fauxProvider(); const models = createModels(); models.setProvider(faux.provider);
  faux.setResponses([fauxAssistantMessage("", { stopReason: "error", errorMessage: "OpenAI API error (401): invalid key" })]);
  const runtime = { mode: "llm" as const, model: faux.getModel(), streamFn: models.streamSimple.bind(models) };
  await assert.rejects(extractJobFields("JD", runtime, new AbortController().signal), /认证或访问权限失败/);
  assert.equal(faux.state.callCount, 1);
  await assert.rejects(extractJobFields("JD", runtime, AbortSignal.abort(new DOMException("timeout", "TimeoutError"))), /超时或已取消/);
  assert.equal(faux.state.callCount, 1);
});
