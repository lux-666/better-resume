import { useEffect, useState } from "react";
import { stageLabels, type AgentStep, type RunProgress, type TelemetryTrace } from "../../../packages/api-contract/src/telemetry.ts";
import type { InterviewState } from "../../../packages/interview-core/src/index.ts";
import { TraceDetails } from "./trace-details.tsx";
import { request } from "./api.ts";

const stepStatus: Record<AgentStep["status"], string> = {
  running: "进行中", succeeded: "已完成", rejected: "未通过校验", failed: "未完成", timed_out: "已超时", interrupted: "已中断", fallback: "已调整方式",
};

export function RunProgressPanel({ run, submitting, reconnecting, state, trace }: {
  run?: RunProgress; submitting?: boolean; reconnecting?: boolean; state?: InterviewState; trace?: TelemetryTrace;
}) {
  const [tick, setTick] = useState(0);
  const [developerOpen, setDeveloperOpen] = useState(false);
  useEffect(() => {
    setTick(0);
    if (run?.status !== "running") return;
    const baseline = performance.now();
    const timer = setInterval(() => setTick(performance.now() - baseline), 250);
    return () => clearInterval(timer);
  }, [run]);
  if (!run && !submitting) return null;
  const steps = run?.steps ?? [];
  const active = !run || run.status === "running";
  const current = steps.findLast((step) => step.status === "running");
  const label = !run ? "正在接收你的回答" : active ? current?.runningLabel ?? stageLabels[run.stage]
    : run.status === "succeeded" ? "本轮处理完成" : run.status === "timed_out" ? "处理超时，回答已保留"
    : run.status === "interrupted" ? "处理已中断，可以重试" : "本轮未完成，回答已保留";
  const completed = steps.filter((step) => step.status === "succeeded" && !steps.some((child) => child.parentId === step.id)).length;
  const elapsed = (run?.elapsedMs ?? 0) + (active ? tick : 0);
  return <section className="agent-timeline" aria-label="面试执行进度">
    <div className="agent-task">
      <span className={`task-symbol ${active ? "active" : ""}`} aria-hidden="true">{active ? "◌" : run?.status === "succeeded" ? "✓" : "!"}</span>
      <div><span className="task-caption">{active ? "当前任务" : "本轮进度"}</span>
        <strong role="status" aria-live="polite" aria-atomic="true">{label}</strong></div>
      <span className="task-time">{(elapsed / 1000).toFixed(1)} 秒</span>
    </div>
    {reconnecting && <p className="timeline-note" role="status">正在重新连接，下面保留的是最近收到的步骤。</p>}
    <details className="agent-trace">
      <summary>执行过程 <span>Agent Trace · 已完成 {completed} 步</span></summary>
      {steps.length ? <ol className="agent-steps">{steps.map((step) => {
        const group = steps.some((child) => child.parentId === step.id);
        const duration = step.elapsedMs + (active && step.status === "running" ? tick : 0);
        return <li key={step.id} className={`${step.parentId ? "nested " : ""}${group ? "step-group " : ""}${step.status}`} aria-current={step.id === current?.id && active ? "step" : undefined}>
          <span className="step-symbol" aria-hidden="true">{step.status === "succeeded" ? "✓" : step.status === "running" ? "◌" : step.status === "fallback" ? "↪" : "!"}</span>
          <div><span>{step.status === "running" ? step.runningLabel : step.label}</span>
            <small>{stepStatus[step.status]}{(step.attempt ?? 1) > 1 ? ` · 第 ${step.attempt} 次尝试` : ""}</small></div>
          {duration >= 1000 && <span className="step-time">{(duration / 1000).toFixed(1)} 秒</span>}
        </li>;
      })}</ol> : <p className="timeline-note">{active ? "等待执行步骤…" : "这次记录没有保留详细步骤。"}</p>}
      {run?.retryCount ? <p className="timeline-note">已重试 {run.retryCount} 次，无需重复提交回答。</p> : null}
      {state && run && <details className="developer-trace" onToggle={(event) => setDeveloperOpen(event.currentTarget.open)}>
        <summary>开发者详情 <span>模型 · 工具 · 用量</span></summary>
        {developerOpen && <DeveloperTrace key={run.traceId} run={run} state={state} trace={trace} />}
      </details>}
    </details>
  </section>;
}

function DeveloperTrace({ run, state, trace }: { run: RunProgress; state: InterviewState; trace?: TelemetryTrace }) {
  const [loaded, setLoaded] = useState<TelemetryTrace>();
  const [error, setError] = useState("");
  useEffect(() => {
    if (trace) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sync = async () => {
      try {
        const value = await request<TelemetryTrace>(`/api/traces/${run.traceId}`);
        if (!disposed) { setLoaded(value); setError(""); }
      } catch { if (!disposed) setError("调用详情暂不可用，执行过程仍会继续更新。"); }
      if (!disposed && run.status === "running") timer = setTimeout(sync, 1000);
    };
    void sync();
    return () => { disposed = true; clearTimeout(timer); };
  }, [run.traceId, run.status, trace]);
  const value = trace ?? loaded;
  return <>{value && <TraceDetails trace={value} state={state} />}{error ? <p>{error}</p> : !value && <p>正在读取调用详情…</p>}</>;
}
