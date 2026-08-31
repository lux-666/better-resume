import assert from "node:assert/strict";
import test from "node:test";
import { createModelRuntime } from "./model-runtime.ts";

test("creates an OpenAI-compatible runtime from .env keys", () => {
  const runtime = createModelRuntime({
    LLM_PROVIDER: "openai_compatible",
    LLM_MODEL: "test-model",
    LLM_BASE_URL: "https://example.com/v1/",
    LLM_API_KEY: "test-key",
    LLM_MAX_TOKENS: "4096",
    LLM_TEMPERATURE: "0.2",
    LLM_TIMEOUT_SECONDS: "30",
  });

  assert.equal(runtime.mode, "llm");
  assert.equal(runtime.model?.provider, "openai_compatible");
  assert.equal(runtime.model?.id, "test-model");
  assert.equal(runtime.model?.baseUrl, "https://example.com/v1");
  assert.equal(runtime.model?.maxTokens, 4096);
  assert.ok(runtime.streamFn);
});

test("uses an explicit demo runtime when no model is configured", () => {
  assert.deepEqual(createModelRuntime({}), { mode: "demo" });
});

test("rejects incomplete OpenAI-compatible configuration", () => {
  assert.throws(() => createModelRuntime({
    LLM_PROVIDER: "openai_compatible",
    LLM_MODEL: "test-model",
  }), /BASE_URL.*API_KEY/);
});
