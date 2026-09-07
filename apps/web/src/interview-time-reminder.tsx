import { useEffect, useState } from "react";
import { interviewTimeBudgetExhausted, type InterviewState } from "../../../packages/interview-core/src/index.ts";

export function InterviewTimeReminder({ state }: { state: InterviewState }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, []);
  const elapsed = state.startedAt ? Math.max(0, Math.floor((now - Date.parse(state.startedAt)) / 60_000)) : 0;
  const exceeded = interviewTimeBudgetExhausted(state, now);
  return <p className={`time-reminder ${exceeded ? "elapsed" : ""}`} role="status">
    已交流 {elapsed} 分钟 · 已完成 {state.turns.filter((t) => t.kind !== "supplement").length}/{state.maxTurns ?? 15} 轮
    {exceeded && <span>已到 {state.timeBudgetMinutes} 分钟提醒时间，可以继续作答，不会因超时结束。</span>}
  </p>;
}
