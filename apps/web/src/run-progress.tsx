import { useEffect, useState } from "react";
import { stageLabels, type RunProgress, type Stage } from "../../../packages/api-contract/src/telemetry.ts";
export function RunProgressPanel({ run, submitting, reconnecting }: { run?: RunProgress; submitting?: boolean; reconnecting?: boolean }) {
  const [elapsed, setElapsed] = useState(run?.elapsedMs ?? 0);
  useEffect(() => {
    const baseline = performance.now();
    setElapsed(run?.elapsedMs ?? 0);
    if (!run || run.status !== "running") return;
    const timer = setInterval(() => setElapsed(run.elapsedMs + performance.now() - baseline), 250);
    return () => clearInterval(timer);
  }, [run]);
  if (!run && !submitting) return null;
  const active = run?.status === "running";
  const label = !run ? "正在提交…" : active ? stageLabels[run.stage as Stage]
    : run.status === "succeeded" ? "本次处理完成" : run.status === "timed_out" ? "本次处理超时，回答已保留"
    : run.status === "interrupted" ? "处理已中断，请恢复或重试" : "本次处理未完成，回答已保留";
  return <section className="run-progress" aria-label="本次处理进度">
    <strong role="status" aria-live="polite">{active || !run ? <span className="spinner" aria-hidden="true" /> : null}{label}</strong>
    {run && <><div className="run-clock">本轮已用 <b>{(elapsed / 1000).toFixed(1)}</b> 秒</div>
      {run.completedStages.length > 0 && <p className="run-steps">{run.completedStages.map((stage) =>
        `✓ ${stage === "report" ? "已整理回答" : stage === "interview" ? "已准备问题" : stage === "saving" ? "已保存" : "已生成叙述"}`).join(" · ")}</p>}
      {run.retryCount > 0 && <p>模型服务正在重试或已重试 {run.retryCount} 次；无需重复提交。</p>}</>}
    {reconnecting && <p>正在重新连接进度，后台处理继续进行。</p>}
  </section>;
}
