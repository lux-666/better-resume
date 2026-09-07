import assert from "node:assert/strict";
import test from "node:test";
import { mergeProgress } from "./use-run-progress.ts";
import type { RunProgress } from "../../../packages/api-contract/src/telemetry.ts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RunProgressPanel } from "./run-progress.tsx";
test("late progress cannot revert a completed trace or replace a different command", () => {
  const run: RunProgress = { traceId: "one", commandId: "cmd", operation: "answer", revision: 2, status: "succeeded", stage: "saving", completedStages: [], startedAt: "2000-01-01", elapsedMs: 100, retryCount: 0 };
  const merged = mergeProgress([run], [{ ...run, revision: 1, status: "running" }, { ...run, traceId: "two", commandId: "cmd2", revision: 0, status: "running" }]);
  assert.equal(merged[0].status, "succeeded"); assert.equal(merged.length, 2);
});
test("timeline renders actual ordered steps, the current task and developer disclosure", () => {
  const run: RunProgress = { traceId: "one", operation: "answer", revision: 2, status: "running", stage: "report", completedStages: [], startedAt: "2000-01-01", elapsedMs: 9500, retryCount: 0,
    steps: [
      { id: "agent", label: "整理候选人回答", runningLabel: "正在分析你的项目经历", status: "running", elapsedMs: 9500 },
      { id: "read", parentId: "agent", label: "读取已有报告", runningLabel: "正在读取已有报告", status: "succeeded", elapsedMs: 10 },
      { id: "model", parentId: "agent", label: "分析回答并整理报告", runningLabel: "正在思考如何补充报告", status: "running", elapsedMs: 9390 },
    ] };
  const render = () => renderToStaticMarkup(createElement(RunProgressPanel, { run }));
  assert.match(render(), /当前任务.*正在思考如何补充报告/);
  assert.match(render(), /读取已有报告.*已完成/);
  assert.match(render(), /aria-current="step"/);
  assert.doesNotMatch(render(), /model_request|0\.01s/);
  run.steps![2].status = "rejected"; run.status = "failed";
  assert.match(render(), /本轮未完成，回答已保留/);
  assert.match(render(), /未通过校验/);
  assert.doesNotMatch(render(), /本轮处理完成/);
  run.steps = undefined;
  assert.match(render(), /没有保留详细步骤/);
});
