import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { configuredEmbedding } from "./embedding.ts";
import { KnowledgeStore } from "./knowledge-store.ts";
import { TelemetryCollector } from "../../../packages/pi-runtime/src/telemetry.ts";
import type { KnowledgeQuery } from "../../../packages/pi-runtime/src/knowledge.ts";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const smoke = process.argv.includes("--smoke");
const dbPath = resolve(process.env.DATABASE_PATH ?? "data/better-resume.db");
mkdirSync(dirname(dbPath), { recursive: true });
const database = new DatabaseSync(dbPath);
database.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000");
try {
  const client = configuredEmbedding();
  if (!client) throw new Error("Configure LLM_EMBEDDING_MODEL, URL and API key first");
  const store = new KnowledgeStore(database, client);
  const cold = await store.index(resolve(root, "knowledge"));
  const warm = await store.index(resolve(root, "knowledge"));
  const queries = JSON.parse(readFileSync(resolve(root, "data/evaluation-corpus/phase4-knowledge-pilot.json"), "utf8")) as Array<KnowledgeQuery & { id: string; expectedIds: string[] }>;
  const results = [];
  for (const { id, expectedIds, ...query } of queries) {
    if (smoke && !["q10", "q17", "q19"].includes(id)) continue;
    const telemetry = new TelemetryCollector(); const started = performance.now();
    const hits = await store.retrieve(query, { telemetry });
    telemetry.end("succeeded");
    results.push({ id, ...query, expectedIds, hits: hits.map(({ id, score }) => ({ id, score })), top1: expectedIds.includes(hits[0]?.id),
      top3: hits.some((hit) => expectedIds.includes(hit.id)), totalDurationMs: performance.now() - started,
      localDurationMs: telemetry.trace.spans.find((span) => span.retrieval)?.retrieval?.localDurationMs ?? 0 });
  }
  const average = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
  const summary = { model: client.model, count: store.health().count, queries: results.length, initialIndex: cold, warmIndex: warm,
    top1: average(results.map((r) => +r.top1)), top3: average(results.map((r) => +r.top3)),
    meanLocalMs: average(results.map((r) => r.localDurationMs)), maxLocalMs: Math.max(...results.map((r) => r.localDurationMs)),
    meanTotalMs: average(results.map((r) => r.totalDurationMs)),
    limitations: `${results.length} synthetic paraphrases, not a real-session benchmark; no question-quality improvement established`,
    mode: smoke ? "smoke" : "pilot" };
  const output = resolve(root, `data/evaluations/phase4-knowledge-${smoke ? "smoke" : "pilot"}.json`); mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify({ createdAt: new Date().toISOString(), summary, results }, null, 2));
  console.log(JSON.stringify({ ...summary, output }, null, 2));
  if (!smoke && summary.top3 < .85) process.exitCode = 1;
} finally { database.close(); }
