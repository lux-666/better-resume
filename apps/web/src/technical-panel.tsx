import { useEffect, useState } from "react";
import type { KnowledgeStatus, TelemetryTrace } from "../../../packages/api-contract/src/telemetry.ts";
import { summarizeTelemetry, type Measurement } from "../../../packages/api-contract/src/telemetry-summary.ts";
import { request } from "./api.ts";
import { projectLeads, type InterviewState } from "../../../packages/interview-core/src/index.ts";
type Data = { traces: TelemetryTrace[]; summary: ReturnType<typeof summarizeTelemetry>; knowledge?: KnowledgeStatus };
const measurement = (value: Measurement) => value.value === null ? "不可用" : `${value.value.toLocaleString()}${value.availability === "partial" ? "（部分）" : ""}`;
export function TechnicalPanel({ state, version }: { state: InterviewState; version: number }) {
  const sessionId = state.sessionId;
  const [data, setData] = useState<Data>();
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  useEffect(() => {
    let disposed = false;
    const sync = () => { void request<Data>(`/api/interviews/${sessionId}/telemetry`).then((value) => {
      if (!disposed) { setData(value); setError(""); }
    }).catch(() => { if (!disposed) setError("运行统计暂不可用"); }); };
    sync(); const timer = setInterval(sync, 2_000);
    return () => { disposed = true; clearInterval(timer); };
  }, [sessionId, version]);
  if (!data) return <p>{error || "正在读取运行统计…"}</p>;
  const trace = data.traces.find((item) => item.traceId === selected) ?? data.traces.at(-1);
  const summary = data.summary;
  const answerLatency = summary.answerLatency;
  const total = trace?.durationMs ?? (trace ? Date.now() - Date.parse(trace.startedAt) : 1);
  const leads = projectLeads(state);
  const decision = trace?.turnId ? state.traces.find((item) => item.turnId === trace.turnId) : state.traces.at(-1);
  return <section className="technical-panel" aria-label="技术视图">
    <h3>Session 运行统计</h3>
    {data.knowledge && <p>当前知识索引：{{ unconfigured: "未配置，使用静态策略", indexing: "正在索引，暂用静态策略", ready: "可检索", failed: "索引失败，使用静态策略" }[data.knowledge.status]} · {data.knowledge.count} 张卡片{data.knowledge.model ? ` · ${data.knowledge.model}` : ""}</p>}
    <p>线索：{leads.filter((lead) => lead.status === "open").length} 待跟进 · {leads.filter((lead) => lead.status === "followed").length} 已跟进 · {leads.filter((lead) => lead.status === "dropped").length} 未展开</p>
    <dl className="progress-grid">
      <div><dt>执行 / 已提交轮次</dt><dd>{summary.traceCount} / {summary.completedTurns}</dd></div>
      <div><dt>Span / 模型请求</dt><dd>{summary.spanCount} / {summary.modelRequestCount}</dd></div>
      <div><dt>重试 / 工具拒绝</dt><dd>{summary.providerRetryCount} / {summary.toolRejectionCount}</dd></div>
      <div><dt>输入 token（含缓存）</dt><dd>{measurement(summary.totalInputTokens)}</dd></div>
      <div><dt>输出 token</dt><dd>{measurement(summary.outputTokens)}</dd></div>
      <div><dt>缓存读取 token</dt><dd>{measurement(summary.cacheReadTokens)}</dd></div>
    </dl>
    <p className="field-hint">成功回答 p50 / p95：{answerLatency.p50Ms === null ? "—" : `${(answerLatency.p50Ms / 1000).toFixed(1)}s`} / {answerLatency.p95Ms === null ? "—" : `${(answerLatency.p95Ms / 1000).toFixed(1)}s`} · n={answerLatency.sampleCount}{answerLatency.sampleCount < 20 ? "（小样本）" : ""}</p>
    <p className="field-hint">Provider 错误 {summary.providerErrors.count}/{summary.providerErrors.sampleCount} · 超时 {summary.timeoutCount} · 备用模型采用 {summary.fallback.adopted}/{summary.fallback.attempted}</p>
    <p className="field-hint">Span：{Object.entries(summary.spansByKind).map(([key, value]) => `${key} ${value}`).join(" · ")}。累计输入与缓存来自 Provider 标准化 usage。</p>
    <label htmlFor="trace-picker">查看执行</label>
    <select id="trace-picker" value={trace?.traceId ?? ""} onChange={(event) => setSelected(event.target.value)}>
      {data.traces.map((item, index) => <option key={item.traceId} value={item.traceId}>#{index + 1} {item.operation ?? "历史执行"} · {item.status ?? "未知"}</option>)}
    </select>
    {trace && <><code>{trace.traceId}</code><p>状态：{trace.status ?? "历史记录"} · 总耗时 {(Math.max(total, 0) / 1000).toFixed(1)}s</p>
      {decision && <details><summary>已提交 Decision · {decision.action}</summary>
        <p>目标字段：{decision.targetFieldId ?? "—"} · 目标层级：{decision.targetDepth ?? "—"}</p>
        <p>知识引用：{decision.knowledgeIds?.join("、") || "无"}</p>
        <p>{decision.reason}</p><p>跟进线索：{leads.find((lead) => lead.id === decision.followsLeadId)?.text ?? "—"}</p>
      </details>}
      <div className="span-list">{trace.spans.map((span) => {
        const start = Math.max(0, Date.parse(span.startedAt) - Date.parse(trace.startedAt));
        const duration = span.durationMs ?? Math.max(0, Date.now() - Date.parse(span.startedAt));
        return <details className={`span-row ${span.parentSpanId ? "child" : ""}`} key={span.spanId}>
          <summary><span>{span.kind === "retrieval" ? "知识检索" : span.kind === "embedding" ? "查询向量化" : span.toolName ?? span.operation}{span.attempt ? ` · 尝试 ${span.attempt}` : ""}</span><small>{span.status ?? "历史"} · {(duration / 1000).toFixed(2)}s</small></summary>
          <div className="span-track"><i style={{ marginLeft: `${Math.min(100, start / Math.max(1, total) * 100)}%`, width: `${Math.min(100, Math.max(.5, duration / Math.max(1, total) * 100))}%` }} /></div>
          <p>{span.provider} {span.responseModel ?? span.model}</p>
          {span.kind === "model" && <p>输入 {span.usage?.input ?? "不可用"} · 输出 {span.usage?.output ?? "不可用"} · 首响应 {span.firstResponseMs === undefined ? "不可用" : `${span.firstResponseMs}ms`} · 上下文 {span.context?.bytes ?? "—"} bytes</p>}
          {span.kind === "tool" && <p>工具结果体积：{span.resultBytes ?? "不可用"} bytes</p>}
          {span.summary && <p>摘要版本 {span.summary.version} · 来源 State {span.summary.sourceStateVersion} · {span.summary.chars}/1500 字符{span.summary.truncated ? " · 部分内容省略，可按需召回" : ""}</p>}
          {span.fallback && <p>备用模型：{span.fallback.fromModel} → {span.fallback.toModel} · {span.fallback.reason} · {span.fallback.adopted ? "已采用" : "未采用"}</p>}
          {span.recall && <section><p>回忆：{span.recall.query} · {span.recall.scope} · {span.recall.projectId ?? "跨项目"} · 来源 State {span.recall.sourceStateVersion}</p>
            {span.recall.hits.map((hit) => <p key={`${hit.kind}:${hit.id}`}>{hit.kind} · {hit.id} · 相似度 {hit.score.toFixed(3)}</p>)}{!span.recall.hits.length && <p>无命中</p>}</section>}
          {span.retrieval && <section aria-label="知识检索">
            <p>查询：{span.retrieval.query}</p>
            <p>过滤：{span.retrieval.fieldKind ?? "全部字段"} · 层级 {span.retrieval.targetDepth ?? "全部"} · 本地检索 {span.retrieval.localDurationMs?.toFixed(2) ?? "—"}ms</p>
            {span.retrieval.fallback && <p>检索不可用，已回退静态追问策略。</p>}
            {span.retrieval.hits.map((hit) => <details key={hit.id}><summary>{hit.id} · 相似度 {hit.score.toFixed(3)} · {span.retrieval!.referencedIds.includes(hit.id) ? "已引用" : "未引用"}</summary>
              <p>{hit.sourcePath}</p><pre style={{ whiteSpace: "pre-wrap" }}>{hit.text}</pre>
              {hit.source && <details><summary>上游素材与来源</summary>
                <p>原题：{hit.source.originalQuestion ?? "未记录"}</p>
                <p>原始考察点：{hit.source.sourceFocus ?? "未记录"}</p>
                {hit.source.sourceUrl && /^https?:\/\//.test(hit.source.sourceUrl) && <a href={hit.source.sourceUrl} target="_blank" rel="noreferrer">{hit.source.sourceTitle ?? "原文"}</a>}
                <p>来源版本：{hit.source.sourceCommit ?? "未记录"}</p>
              </details>}
            </details>)}
            {!span.retrieval.hits.length && !span.retrieval.fallback && <p>没有匹配的知识卡片。</p>}
          </section>}
          {span.error && <p className="error">{span.error.message}</p>}
          {span.outcome === "rejected" && <p>校验拒绝：{span.blockerCodes?.join("、") ?? "工具校验未通过"}</p>}
        </details>;
      })}</div></>}
    {error && <p className="error">{error}</p>}
  </section>;
}
