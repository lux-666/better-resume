import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import {
  editReportWithAgent,
  TelemetryCollector,
  type TelemetryTrace,
  withOneProviderRetry,
} from "../../../packages/pi-runtime/src/index.ts";
import { buildAllFrozenReportCases } from "./frozen-report-cases.ts";
import { createModelRuntime, resolveRoutingModelIds } from "./model-runtime.ts";

const root = resolve(import.meta.dirname, "../../..");
const { weakModelId, strongModelId } = resolveRoutingModelIds();
const cases = buildAllFrozenReportCases();

type ReplayComparison = {
  caseId: string;
  fixtureFingerprint: string;
  profile: string;
  answer: string;
  expectedAnswerDisposition: string;
  actualAnswerDisposition?: string;
  expectedEvidence: Array<{
    reportFieldIds: string[];
    claimIds: string[];
    competencyId: string;
    polarity: string;
    sourceQuote: string;
  }>;
  actualEvidence: Array<{
    reportFieldIds: string[];
    claimIds: string[];
    competencyId: string;
    polarity: string;
    sourceQuote: string;
  }>;
  expectedFieldIds: string[];
  actualFieldIds: string[];
  expectedClaimIds: string[];
  actualClaimIds: string[];
  initialContextFingerprint?: string;
  error?: string;
  telemetry: TelemetryTrace;
};

const runs: Array<{
  modelId: string;
  cases: number;
  failures: number;
  reportFieldPrecision: number | null;
  reportFieldRecall: number | null;
  comparisons: ReplayComparison[];
}> = [];
for (const modelId of [weakModelId, strongModelId]) {
  const runtime = createModelRuntime(process.env, modelId);
  if (!runtime.model || !runtime.streamFn) throw new Error(`Model runtime is incomplete: ${modelId}`);
  const comparisons: ReplayComparison[] = [];
  for (const item of cases) {
    const telemetry = new TelemetryCollector({ sessionId: item.state.sessionId });
    let attempt = 1;
    try {
      const edit = await withOneProviderRetry(() => editReportWithAgent({
        model: runtime.model!,
        streamFn: runtime.streamFn!,
        state: structuredClone(item.state),
        answer: item.answer,
        telemetry, attempt,
      }), () => { attempt += 1; });
      telemetry.end("succeeded");
      comparisons.push({
        caseId: item.id,
        fixtureFingerprint: item.fixtureFingerprint,
        profile: item.profile,
        answer: item.answer,
        expectedAnswerDisposition: item.expectedAnswerDisposition,
        actualAnswerDisposition: edit.answerDisposition,
        expectedEvidence: item.expectedEvidence,
        actualEvidence: edit.evidence,
        expectedFieldIds: item.expectedFieldIds,
        actualFieldIds: [...new Set(edit.evidence.flatMap((evidence) => evidence.reportFieldIds))].sort(),
        expectedClaimIds: item.expectedClaimIds,
        actualClaimIds: [...new Set(edit.evidence.flatMap((evidence) => evidence.claimIds))].sort(),
        initialContextFingerprint: telemetry.trace.spans.find((span) => span.kind === "model")?.context?.fingerprint,
        telemetry: telemetry.trace,
      });
    } catch (error) {
      telemetry.end("failed");
      comparisons.push({
        caseId: item.id,
        fixtureFingerprint: item.fixtureFingerprint,
        profile: item.profile,
        answer: item.answer,
        expectedAnswerDisposition: item.expectedAnswerDisposition,
        expectedEvidence: item.expectedEvidence,
        actualEvidence: [],
        expectedFieldIds: item.expectedFieldIds,
        actualFieldIds: [],
        expectedClaimIds: item.expectedClaimIds,
        actualClaimIds: [],
        error: error instanceof Error ? error.message : String(error),
        telemetry: telemetry.trace,
      });
    }
  }
  let matched = 0;
  let predicted = 0;
  let gold = 0;
  for (const comparison of comparisons) {
    const expected = new Set(comparison.expectedFieldIds);
    const actual = new Set(comparison.actualFieldIds);
    matched += [...actual].filter((id) => expected.has(id)).length;
    predicted += actual.size;
    gold += expected.size;
  }
  runs.push({
    modelId,
    cases: comparisons.length,
    failures: comparisons.filter((item) => "error" in item).length,
    reportFieldPrecision: predicted === 0 ? null : matched / predicted,
    reportFieldRecall: gold === 0 ? null : matched / gold,
    comparisons,
  });
  console.error(JSON.stringify({
    type: "frozen_report_replay_run",
    modelId,
    cases: comparisons.length,
    failures: comparisons.filter((item) => "error" in item).length,
  }));
}

const fingerprintMismatches = cases.filter((item) => {
  const fingerprints = runs.map((run) => run.comparisons.find((comparison) => comparison.caseId === item.id))
    .map((comparison) => comparison?.initialContextFingerprint).filter(Boolean);
  return fingerprints.length !== runs.length || new Set(fingerprints).size !== 1;
}).map((item) => item.id);
const outputPath = resolve(root, process.env.ROUTING_REPLAY_OUTPUT_PATH?.trim()
  || `data/evaluations/frozen-report-replay-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
const output = {
  type: "frozen_report_replay_result",
  version: "1.5-c-report-replay-v0.1",
  provider: process.env.LLM_PROVIDER ?? process.env.GENE_AGENT_LLM_PROVIDER ?? process.env.PI_PROVIDER,
  weakModelId,
  strongModelId,
  frozenCases: cases.length,
  frozenCaseManifest: cases.map((item) => ({
    caseId: item.id,
    fixtureFingerprint: item.fixtureFingerprint,
    expectedAnswerDisposition: item.expectedAnswerDisposition,
    expectedFieldIds: item.expectedFieldIds,
    expectedClaimIds: item.expectedClaimIds,
  })),
  fingerprintMismatches,
  runs,
};
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ ...output, outputPath: relative(root, outputPath) }));
if (fingerprintMismatches.length > 0 || runs.some((run) => run.failures > 0)) process.exitCode = 1;
