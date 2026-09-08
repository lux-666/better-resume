import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { configuredEmbedding } from "./embedding.ts";
import { configuredReranker } from "./rerank.ts";
import { KnowledgeStore } from "./knowledge-store.ts";
import { TelemetryCollector } from "../../../packages/pi-runtime/src/telemetry.ts";
import type { KnowledgeQuery } from "../../../packages/pi-runtime/src/knowledge.ts";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const smoke = process.argv.includes("--smoke"), full = process.argv.includes("--full"), compare = process.argv.includes("--compare");
const selected = process.argv.find((arg) => arg.startsWith("--queries="))?.slice("--queries=".length).split(",");
if (smoke && full) throw new Error("Choose --smoke or --full");
const dbPath = resolve(process.env.DATABASE_PATH ?? "data/better-resume.db");
mkdirSync(dirname(dbPath), { recursive: true });
const database = new DatabaseSync(dbPath);
database.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000");
try {
  const client = configuredEmbedding();
  if (!client) throw new Error("Configure LLM_EMBEDDING_MODEL, URL and API key first");
  const reranker = process.argv.includes("--no-rerank") ? undefined : configuredReranker();
  if (compare && !reranker) throw new Error("Comparison requires LLM_MINI_MODEL");
  const store = new KnowledgeStore(database, client, reranker);
  const initialIndex = await store.index(resolve(root, "knowledge"));
  const warmIndex = await store.index(resolve(root, "knowledge"));
  const queries = JSON.parse(readFileSync(resolve(root, full ? "data/evaluation-corpus/knowledge-full.json" : "data/evaluation-corpus/phase4-knowledge-pilot.json"), "utf8")) as Array<KnowledgeQuery & { id: string; expectedIds: string[] }>;
  async function measure(id: string, query: KnowledgeQuery, expectedIds: string[], mode: "adaptive" | "always_rerank") {
    const telemetry = new TelemetryCollector(), started = performance.now();
    const hits = await store.retrieve(query, { telemetry, forceRerank: mode === "always_rerank" });
    telemetry.end("succeeded");
    const retrieval = telemetry.trace.spans.find((span) => span.retrieval)!.retrieval!;
    console.log(JSON.stringify({ id, mode, confidence: retrieval.cascade?.confidence, rerank: retrieval.rerank?.status ?? "skipped", hits: hits.length }));
    return { id, mode, ...query, expectedIds, hits: hits.map(({ id, score, rerankScore }) => ({ id, score, rerankScore })),
      top1: expectedIds.includes(hits[0]?.id), top3: hits.slice(0, 3).some((hit) => expectedIds.includes(hit.id)),
      recall: hits.some((hit) => expectedIds.includes(hit.id)), contextChars: JSON.stringify(hits).length, returned: hits.length,
      rerank: retrieval.rerank, cascade: retrieval.cascade, totalDurationMs: performance.now() - started, localDurationMs: retrieval.localDurationMs ?? 0 };
  }
  const results: Awaited<ReturnType<typeof measure>>[] = [];
  for (const { id, expectedIds, ...query } of queries) {
    if (smoke && !["q10", "q17", "q19"].includes(id)) continue;
    if (selected && !selected.includes(id)) continue;
    results.push(await measure(id, query, expectedIds, "adaptive"));
    if (results.at(-1)?.rerank?.status === "fallback") break;
    if (compare) results.push(await measure(id, query, expectedIds, "always_rerank"));
    if (results.at(-1)?.rerank?.status === "fallback") break;
  }
  const average = (values: number[]) => values.reduce((a, b) => a + b, 0) / (values.length || 1);
  const modes = ["adaptive", ...(compare ? ["always_rerank"] : [])].map((mode) => {
    const group = results.filter((r) => r.mode === mode);
    return { mode, queries: group.length, top1: average(group.map((r) => +r.top1)), top3: average(group.map((r) => +r.top3)), recall: average(group.map((r) => +r.recall)),
      rerankCalls: group.filter((r) => r.rerank).length, rerankFailures: group.filter((r) => r.rerank?.status === "fallback").length,
      meanReturned: average(group.map((r) => r.returned)), meanContextChars: average(group.map((r) => r.contextChars)),
      meanTotalMs: average(group.map((r) => r.totalDurationMs)), meanLocalMs: average(group.map((r) => r.localDurationMs)) };
  });
  const summary = { model: client.model, miniModel: reranker?.model, count: store.health().count, initialIndex, warmIndex, modes,
    limitations: "Synthetic queries; confidence gates are heuristics, not calibrated probabilities. Compare identical queries and candidate pools; no real-session quality improvement established." };
  const output = resolve(root, `data/evaluations/knowledge-${full ? "full" : smoke ? "smoke" : "pilot"}${compare ? "-comparison" : !reranker ? "-hybrid" : "-adaptive"}${selected ? "-selected" : ""}.json`);
  mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify({ createdAt: new Date().toISOString(), summary, results }, null, 2));
  console.log(JSON.stringify({ ...summary, output }, null, 2));
  if (modes.some((m) => m.rerankFailures)) process.exitCode = 1;
  if (!full && !smoke && modes[0].recall < .85) process.exitCode = 1;
} finally { database.close(); }
