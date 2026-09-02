import assert from "node:assert/strict";
import test from "node:test";
import { createModelRuntime, resolveAgentModelIds, resolveRoutingModelIds } from "./model-runtime.ts";

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
  assert.equal(runtime.model?.api, "openai-responses");
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

test("resolves separate report and interview models with one default", () => {
  assert.deepEqual(resolveAgentModelIds({
    LLM_MODEL: "gpt-5.6-terra",
    LLM_REPORT_MODEL: "gpt-5.6-terra",
    LLM_INTERVIEW_MODEL: "gpt-5.6-sol",
  }), { reportModelId: "gpt-5.6-terra", interviewModelId: "gpt-5.6-sol" });
  assert.deepEqual(resolveAgentModelIds({ LLM_MODEL: "same" }), {
    reportModelId: "same", interviewModelId: "same",
  });
  assert.deepEqual(resolveAgentModelIds({ PI_MODEL: "legacy" }), {
    reportModelId: "legacy", interviewModelId: "legacy",
  });
});

test("routing model roles come from environment configuration", () => {
  assert.deepEqual(resolveRoutingModelIds({
    LLM_WEAK_MODEL: "gpt-5.6-terra",
    LLM_STRONG_MODEL: "gpt-5.6-sol",
  }), { weakModelId: "gpt-5.6-terra", strongModelId: "gpt-5.6-sol" });
  assert.throws(() => resolveRoutingModelIds({}), /WEAK_MODEL.*STRONG_MODEL/);
  assert.throws(() => resolveRoutingModelIds({
    LLM_WEAK_MODEL: "same", LLM_STRONG_MODEL: "same",
  }), /must be different/);
});
