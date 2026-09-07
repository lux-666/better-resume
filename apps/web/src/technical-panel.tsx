import { TraceDetails } from "./trace-details.tsx";
import { RunProgressPanel } from "./run-progress.tsx";
import { projectRunProgress } from "../../../packages/api-contract/src/telemetry-summary.ts";
import { useEffect, useState } from "react";
import type { KnowledgeStatus, TelemetryTrace } from "../../../packages/api-contract/src/telemetry.ts";
import { summarizeTelemetry, type Measurement } from "../../../packages/api-contract/src/telemetry-summary.ts";
import { request } from "./api.ts";
import { projectLeads, type InterviewState } from "../../../packages/interview-core/src/index.ts";
type Data = { traces: TelemetryTrace[]; summary: ReturnType<typeof summarizeTelemetry>; knowledge?: KnowledgeStatus };
const measurement = (value: Measurement) => value.value === null ? "不可用" : `${value.value.toLocaleString()}${value.availability === "partial" ? "（部分）" : ""}`;
export function TechnicalPanel({ state, version, rounds = false }: { state: InterviewState; version: number; rounds?: boolean }) {
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
  if (!data) return rounds ? <RoundDetails state={state} traces={[]} error={error} /> : <p>{error || "正在读取运行统计…"}</p>;
  const trace = data.traces.find((item) => item.traceId === selected) ?? data.traces.at(-1);
  const summary = data.summary;
  const answerLatency = summary.answerLatency;
  const leads = projectLeads(state);
  if (rounds) return <RoundDetails state={state} traces={data.traces} error={error} />;
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
    {trace && <TraceDetails trace={trace} state={state} />}
    {error && <p className="error">{error}</p>}
  </section>;
}


function RoundDetails({ state, traces, error }: { state: InterviewState; traces: TelemetryTrace[]; error: string }) {
  const groups = [{ id: "start", label: "面试准备", turn: undefined as InterviewState["turns"][number] | undefined, traces: [] as TelemetryTrace[] },
    ...state.turns.map((turn) => ({ id: turn.id, label: `第 ${turn.index + 1} 轮${turn.kind === "discussion" ? " · 开放交流" : turn.kind === "supplement" ? " · 补充" : ""}`, turn, traces: [] as TelemetryTrace[] })),
    { id: `pending:${state.turns.length}`, label: `第 ${state.turns.length + 1} 轮 · 处理中或待重试`, turn: undefined, traces: [] as TelemetryTrace[] }];
  for (const trace of traces.filter((t) => t.operation !== "narrative" && t.status !== "running")) {
    const committed = trace.commandId ? traces.findLast((t) => t.commandId === trace.commandId && t.status === "succeeded" && t.turnId) : undefined;
    let group = groups.find((g) => g.turn && g.turn.id === (committed?.turnId ?? trace.turnId));
    if (!group && (trace.operation === "start" || trace.operation === "create")) group = groups[0];
    if (!group && trace.stateVersion !== undefined) group = groups.find((g) => g.turn && state.traces.findIndex((d) => d.turnId === g.turn!.id) >= trace.stateVersion!);
    (group ?? groups.at(-1)!).traces.push(trace);
  }
  const visible = groups.filter((g) => g.turn || g.traces.length);
  const latest = visible.at(-1)?.id;
  const [expanded, setExpanded] = useState<string>();
  useEffect(() => { setExpanded(latest); }, [latest]);
  return <section className="round-history" aria-label="问答与调用详情">
    <h3>问答记录</h3>
    {visible.map((group) => <details className="round-details" key={group.id} open={expanded === group.id}>
      <summary onClick={(event) => { event.preventDefault(); setExpanded(expanded === group.id ? undefined : group.id); }}>
        <strong>{group.label}</strong><span>{group.traces.some((t) => t.status === "succeeded") ? "已处理" : "待处理"}{group.traces.length > 1 ? ` · ${group.traces.length} 次尝试` : ""}</span>
      </summary>
      {group.turn && <><p className="round-question">{group.turn.question}</p>
        {state.clarifications?.filter((c) => c.question === group.turn!.question).map((c) => <p key={c.id}>候选人：{c.request}<br />问题说明：{c.response}</p>)}
        <p className="answer-text">{group.turn.answer}</p>
        {group.turn.interviewerResponse && <p className="interviewer-response">面试官：{group.turn.interviewerResponse}</p>}</>}
      {group.traces.map((trace, index) => <section className="round-execution" key={trace.traceId}>
        {group.traces.length > 1 && <h4>执行 {index + 1}</h4>}<RunProgressPanel key={trace.traceId} run={projectRunProgress(trace)} trace={trace} state={state} />
      </section>)}
      {!group.traces.length && <p className="field-hint">该轮没有保留调用记录。</p>}
    </details>)}
    {error && <p className="error">{error}</p>}
  </section>;
}
