import assert from "node:assert/strict";
import test from "node:test";
import { preliminaryRoutingDecision, routingConfigurations, summarizeRoutingRun, type RoutingProfileResult } from "./routing-matrix.ts";

const result = (profile: string, latency: number, tokens: number): RoutingProfileResult => ({
  type: "profile_result",
  status: "passed",
  profile,
  failures: [],
  scorecard: {
    evidenceExtraction: {
      reportFields: {
        precision: { matched: 2, total: 2, rate: 1 },
        recall: { matched: 2, total: 2, rate: 1 },
      },
    },
    telemetry: {
      modelRequests: 2, modelLatencyMs: latency, inputTokens: tokens, outputTokens: 10,
      cachedReadTokens: 0, cachedWriteTokens: 0, errors: 0,
    },
  },
});

test("routing matrix keeps one provider while varying agent model assignments", () => {
  assert.deepEqual(routingConfigurations("terra", "sol"), [
    { id: "weak_only", reportModelId: "terra", interviewModelId: "terra" },
    { id: "strong_only", reportModelId: "sol", interviewModelId: "sol" },
    { id: "static_split", reportModelId: "terra", interviewModelId: "sol" },
  ]);
});

test("behavior matrix remains inconclusive when strategies follow different trajectories", () => {
  const profiles = ["strong", "weak", "contradictory", "multi_field", "vertical_depth", "evasive"];
  const configurations = routingConfigurations("terra", "sol");
  const runs = configurations.map((configuration) => summarizeRoutingRun({
    configuration,
    results: profiles.map((profile) => result(profile, configuration.id === "static_split" ? 80 : 100, 100)),
    exitCode: 0,
    durationMs: 100,
  }));
  assert.equal(preliminaryRoutingDecision(runs).status, "inconclusive");
});
