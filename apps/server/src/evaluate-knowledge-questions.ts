import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { configuredEmbedding } from "./embedding.ts";
import { configuredReranker } from "./rerank.ts";
import { configuredRuntimes } from "./configured-runtimes.ts";
import { KnowledgeStore } from "./knowledge-store.ts";
import { buildCandidateFromIntake, buildInterviewRole, createInterviewState, startInterview, recordAnswer, applyInterviewDecision } from "../../../packages/interview-core/src/index.ts";
import { decideNextStepWithAgent, TelemetryCollector, withOneProviderRetry } from "../../../packages/pi-runtime/src/index.ts";
const cases = [
  { id: "rag", answer: "我负责 RAG 检索模块，把文档按段落切块，BM25 和向量检索分别召回，再通过 reranker 重排。上线时比较过召回率和响应时间。" },
  { id: "idempotency", answer: "我负责多 Agent 工具执行的恢复。每次工具调用带幂等键，状态写入 checkpoint，进程重启后从已保存的位置恢复，避免重复提交订单。" },
  { id: "prompt-cache", answer: "我负责模型调用成本优化。我们保留相同的系统提示前缀，通过 prompt caching 复用缓存，观察输入费用和首 token 延迟。" },
];
const database = new DatabaseSync(resolve(process.env.DATABASE_PATH ?? "data/better-resume.db"));
const smoke = process.argv.includes("--smoke");
const output = resolve(`data/evaluations/phase4-knowledge-questions${smoke ? "-smoke" : ""}.json`);
const results: unknown[] = [];
try {
  const runtime = configuredRuntimes().interview;
  if (runtime.mode !== "llm") throw new Error("Configure the interview model before running question comparison");
  const knowledge = new KnowledgeStore(database, configuredEmbedding(), configuredReranker());
  await knowledge.index(fileURLToPath(new URL("../../../knowledge", import.meta.url)));
  if (knowledge.health().status !== "ready") throw new Error("Knowledge must be ready for the comparison");
  for (const sample of cases) {
    if (smoke && sample.id !== "idempotency") continue;
    const intake = { candidate: { name: "冻结试验", skills: ["AI Agent", "RAG"], projects: [{ name: "AI 应用工程", description: "负责模型应用的开发、评估和运行优化。" }] }, job: { title: "AI 应用工程师", introduction: "开发可靠的 AI 应用", responsibilities: "设计并实现 AI 应用，评估效果与工程可靠性。", requirements: "能够解释实际实现与技术取舍。" } };
    const role = buildInterviewRole({ job: intake.job });
    const frozen = createInterviewState(`knowledge-${sample.id}`, role, buildCandidateFromIntake(intake, role), intake);
    frozen.phaseVersion = 3; startInterview(frozen); recordAnswer(frozen, sample.answer, [], "substantive");
    for (const enabled of [false, true]) {
      const state = structuredClone(frozen); const telemetry = new TelemetryCollector({ operation: "knowledge_question_comparison" });
      const retrievalBudget = { remaining: 2 }; let attempt = 0;
      const decision = await withOneProviderRetry(() => decideNextStepWithAgent({ model: runtime.model!, streamFn: runtime.streamFn!, state,
        knowledge: enabled ? knowledge : undefined, telemetry, retrievalBudget, attempt: ++attempt }));
      applyInterviewDecision(state, decision); telemetry.end("succeeded");
      results.push({ id: sample.id, enabled, frozenState: frozen, decision, trace: telemetry.trace, humanSpecificityScore: null });
      console.log(JSON.stringify({ id: sample.id, enabled, question: decision.question, knowledgeIds: decision.knowledgeIds ?? [],
        retrievals: telemetry.trace.spans.filter((span) => span.kind === "retrieval").length }));
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, JSON.stringify({ createdAt: new Date().toISOString(), model: runtime.modelId, results,
        limitation: `${smoke ? "One" : "Three"} synthetic frozen states; no human scoring; this does not establish a quality improvement.` }, null, 2));
    }
  }
  console.log(`Saved question pairs and traces: ${output}`);
} finally { database.close(); }
