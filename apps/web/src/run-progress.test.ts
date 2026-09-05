import assert from "node:assert/strict";
import test from "node:test";
import { mergeProgress } from "./use-run-progress.ts";
import type { RunProgress } from "../../../packages/api-contract/src/telemetry.ts";
test("late progress cannot revert a completed trace or replace a different command", () => {
  const run: RunProgress = { traceId: "one", commandId: "cmd", operation: "answer", revision: 2, status: "succeeded", stage: "saving", completedStages: [], startedAt: "2000-01-01", elapsedMs: 100, retryCount: 0 };
  const merged = mergeProgress([run], [{ ...run, revision: 1, status: "running" }, { ...run, traceId: "two", commandId: "cmd2", revision: 0, status: "running" }]);
  assert.equal(merged[0].status, "succeeded"); assert.equal(merged.length, 2);
});
