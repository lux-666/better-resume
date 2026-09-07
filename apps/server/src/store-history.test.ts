import assert from "node:assert/strict";
import test from "node:test";
import { InterviewStore } from "./store.ts";
import { createFixtureCandidate, createInterviewState } from "../../../packages/interview-core/src/index.ts";

test("history listing hydrates legacy sessions before reading role metadata", () => {
  const store = new InterviewStore(":memory:");
  try {
    const state = createInterviewState("legacy", "role", createFixtureCandidate("旧会话"));
    delete (state as never as { role?: unknown }).role;
    store.create(state);
    assert.deepEqual(store.history().map(({ sessionId, candidateName, roleName, status, turnCount }) => ({ sessionId, candidateName, roleName, status, turnCount })),
      [{ sessionId: "legacy", candidateName: "旧会话", roleName: "通用候选人", status: "draft", turnCount: 0 }]);
  } finally { store.close(); }
});
