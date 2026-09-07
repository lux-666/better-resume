type RoutingConfiguration = {
  id: "weak_only" | "strong_only" | "static_split";
  reportModelId: string;
  interviewModelId: string;
};

type Ratio = { matched: number; total: number; rate: number | null };

export type RoutingProfileResult = {
  type: "profile_result";
  status: "passed" | "failed";
  profile: string;
  failures: Array<{ severity: "critical" | "major"; code: string }>;
  turnComparisons?: Array<{
    index: number;
    answer: string;
    expectedFieldIds: string[];
    actualFieldIds: string[];
    expectedClaimIds: string[];
    actualClaimIds: string[];
  }>;
  scorecard: {
    evidenceExtraction: { reportFields: { precision: Ratio; recall: Ratio } };
    telemetry: {
      modelRequests: number;
      modelLatencyMs: number;
      inputTokens: number | null;
      outputTokens: number | null;
      cachedReadTokens: number | null;
      cachedWriteTokens: number | null;
      errors: number;
    };
  };
};

export function routingConfigurations(weakModelId: string, strongModelId: string): RoutingConfiguration[] {
  return [
    { id: "weak_only", reportModelId: weakModelId, interviewModelId: weakModelId },
    { id: "strong_only", reportModelId: strongModelId, interviewModelId: strongModelId },
    { id: "static_split", reportModelId: weakModelId, interviewModelId: strongModelId },
  ];
}

function nullableSum(values: Array<number | null>): number | null {
  return values.some((value) => value === null) ? null : (values as number[]).reduce((sum, value) => sum + value, 0);
}

function aggregateRatio(values: Ratio[]): Ratio {
  const matched = values.reduce((sum, value) => sum + value.matched, 0);
  const total = values.reduce((sum, value) => sum + value.total, 0);
  return { matched, total, rate: total === 0 ? null : Number((matched / total).toFixed(4)) };
}

export function summarizeRoutingRun(options: {
  configuration: RoutingConfiguration;
  results: RoutingProfileResult[];
  exitCode: number | null;
  durationMs: number;
  error?: unknown;
}) {
  const { configuration, results } = options;
  const failures = results.flatMap((result) => result.failures);
  return {
    configuration,
    processExitCode: options.exitCode,
    durationMs: options.durationMs,
    completedProfiles: results.length,
    passedProfiles: results.filter((result) => result.status === "passed").length,
    profileResults: results.map((result) => ({
      profile: result.profile,
      status: result.status,
      failureCodes: result.failures.map((failure) => failure.code),
      turnComparisons: result.turnComparisons ?? [],
    })),
    quality: {
      criticalFailures: failures.filter((failure) => failure.severity === "critical").length,
      majorFailures: failures.filter((failure) => failure.severity === "major").length,
      reportFieldPrecision: aggregateRatio(results.map((result) =>
        result.scorecard.evidenceExtraction.reportFields.precision)),
      reportFieldRecall: aggregateRatio(results.map((result) =>
        result.scorecard.evidenceExtraction.reportFields.recall)),
    },
    telemetry: {
      modelRequests: results.reduce((sum, result) => sum + result.scorecard.telemetry.modelRequests, 0),
      modelLatencyMs: results.reduce((sum, result) => sum + result.scorecard.telemetry.modelLatencyMs, 0),
      inputTokens: nullableSum(results.map((result) => result.scorecard.telemetry.inputTokens)),
      outputTokens: nullableSum(results.map((result) => result.scorecard.telemetry.outputTokens)),
      cachedReadTokens: nullableSum(results.map((result) => result.scorecard.telemetry.cachedReadTokens)),
      cachedWriteTokens: nullableSum(results.map((result) => result.scorecard.telemetry.cachedWriteTokens)),
      errors: results.reduce((sum, result) => sum + result.scorecard.telemetry.errors, 0),
    },
    error: options.error instanceof Error ? options.error.message : options.error ? String(options.error) : undefined,
  };
}

export type RoutingRunSummary = ReturnType<typeof summarizeRoutingRun>;

export function preliminaryRoutingDecision(runs: RoutingRunSummary[]) {
  const weak = runs.find((run) => run.configuration.id === "weak_only");
  const strong = runs.find((run) => run.configuration.id === "strong_only");
  const split = runs.find((run) => run.configuration.id === "static_split");
  if (!weak || !strong || !split || runs.some((run) => run.completedProfiles !== 6)) {
    return { status: "incomplete" as const, reason: "At least one strategy did not complete all six profiles." };
  }
  const tokenImproved = split.telemetry.inputTokens !== null && strong.telemetry.inputTokens !== null
    && split.telemetry.inputTokens + (split.telemetry.outputTokens ?? 0)
      < strong.telemetry.inputTokens + (strong.telemetry.outputTokens ?? 0);
  const latencyImproved = split.telemetry.modelLatencyMs < strong.telemetry.modelLatencyMs;
  return {
    status: "inconclusive" as const,
    reason: "The strategies followed different interview trajectories, so aggregate Gold denominators and field precision are not directly comparable. Frozen-context replay is required for quality comparison.",
    tokenImproved,
    latencyImproved,
  };
}
