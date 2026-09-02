import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import {
  preliminaryRoutingDecision,
  routingConfigurations,
  summarizeRoutingRun,
  type RoutingProfileResult,
  type RoutingRunSummary,
} from "./routing-matrix.ts";
import { resolveRoutingModelIds } from "./model-runtime.ts";

const { weakModelId, strongModelId } = resolveRoutingModelIds();
const root = resolve(import.meta.dirname, "../../..");
const runs: RoutingRunSummary[] = [];

for (const configuration of routingConfigurations(weakModelId, strongModelId)) {
  const startedAt = performance.now();
  const child = spawnSync(process.execPath, ["--import", "tsx", "apps/server/src/evaluate-profiles.ts", "all"], {
    cwd: root,
    env: {
      ...process.env,
      LLM_REPORT_MODEL: configuration.reportModelId,
      LLM_INTERVIEW_MODEL: configuration.interviewModelId,
    },
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
  const results = child.stdout.split("\n").flatMap((line): RoutingProfileResult[] => {
    if (!line.trim().startsWith("{")) return [];
    try {
      const parsed = JSON.parse(line) as { type?: string };
      return parsed.type === "profile_result" ? [parsed as RoutingProfileResult] : [];
    } catch {
      return [];
    }
  });
  const errorLine = child.stderr.split("\n").find((line) => line.trim().startsWith("{"));
  const summary = summarizeRoutingRun({
    configuration,
    results,
    exitCode: child.status,
    durationMs: Math.round(performance.now() - startedAt),
    error: child.error ?? errorLine,
  });
  runs.push(summary);
  console.error(JSON.stringify({ type: "routing_run_result", ...summary }));
}

const decision = preliminaryRoutingDecision(runs);
const outputPath = resolve(root, process.env.ROUTING_OUTPUT_PATH?.trim()
  || `data/evaluations/routing-matrix-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
const output = {
  type: "routing_matrix_result",
  version: "1.5-c-v0.1",
  provider: process.env.LLM_PROVIDER ?? process.env.GENE_AGENT_LLM_PROVIDER ?? process.env.PI_PROVIDER,
  weakModelId,
  strongModelId,
  caveat: "This is a behavior matrix with deterministic profiles, not frozen-context replay. It cannot authorize production routing by itself.",
  runs,
  decision,
};
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ ...output, outputPath: relative(root, outputPath) }));

if (decision.status === "incomplete") process.exitCode = 2;
