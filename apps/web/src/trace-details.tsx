import type { TelemetryTrace } from "../../../packages/api-contract/src/telemetry.ts";
import { projectLeads, type InterviewState } from "../../../packages/interview-core/src/index.ts";

export function TraceDetails({ trace, state }: { trace: TelemetryTrace; state: InterviewState }) {
  const total = trace.durationMs ?? Date.now() - Date.parse(trace.startedAt);
  const leads = projectLeads(state);
  const decision = trace.turnId ? state.traces.find((item) => item.turnId === trace.turnId) : undefined;
  return <><code>{trace.traceId}</code><p>状态：{trace.status ?? "历史记录"} · 总耗时 {(Math.max(total, 0) / 1000).toFixed(1)}s</p>
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
      })}</div></>;
}

