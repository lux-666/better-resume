import assert from "node:assert/strict";
import test from "node:test";
import { buildAllFrozenReportCases } from "./frozen-report-cases.ts";

test("frozen report corpus covers every profile and preserves complete multi-label Gold", () => {
  const cases = buildAllFrozenReportCases();
  assert.deepEqual(new Set(cases.map((item) => item.profile)), new Set([
    "strong", "weak", "contradictory", "multi_field", "vertical_depth", "evasive",
  ]));
  const failure = cases.find((item) => item.answer.startsWith("短商品名查询曾经召回为空"));
  assert.deepEqual(new Set(failure?.expectedFieldIds), new Set([
    "project_enterprise_rag:mechanism",
    "project_enterprise_rag:measurement",
    "project_enterprise_rag:failure",
  ]));
  const hybrid = cases.find((item) => item.answer.startsWith("我负责召回模块"));
  assert.deepEqual(new Set(hybrid?.expectedFieldIds), new Set([
    "project_enterprise_rag:ownership",
    "project_enterprise_rag:mechanism",
  ]));
  assert.ok(cases.every((item) => item.state.currentQuestion));
  assert.ok(cases.every((item) => item.expectedEvidence.every((evidence) =>
    item.answer.includes(evidence.sourceQuote)
  )));
});

test("frozen report corpus is deterministic across builds", () => {
  const first = buildAllFrozenReportCases();
  const second = buildAllFrozenReportCases();
  assert.deepEqual(
    first.map((item) => ({ id: item.id, fingerprint: item.fixtureFingerprint })),
    second.map((item) => ({ id: item.id, fingerprint: item.fixtureFingerprint })),
  );
  assert.ok(first.every((item) => item.state.candidate.id === `candidate:${item.profile}`));
});
