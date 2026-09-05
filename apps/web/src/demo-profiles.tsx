import { useEffect, useState } from "react";
import type { CreateInterviewBody } from "@better-resume/api-contract";
import type { DemoReplay } from "../../server/src/demo-profiles.ts";
import { request } from "./api.ts";
export function DemoProfiles({ onChoose }: { onChoose: (intake: CreateInterviewBody) => void }) {
  const [profiles, setProfiles] = useState<Array<{ id: string; label: string; intake: CreateInterviewBody }>>([]);
  const [replay, setReplay] = useState<DemoReplay>();
  const [index, setIndex] = useState(0);
  const [notice, setNotice] = useState("");
  useEffect(() => { void request<typeof profiles>("/api/demo-profiles").then(setProfiles).catch(() => {}); }, []);
  return <details className="demo-profiles"><summary>演示档案与真实记录回放</summary>
    <p className="field-hint">填入固定输入后，仍通过当前运行模式实际执行。回放只读取此前保存的执行记录。</p>
    {profiles.map((profile) => <div className="demo-choice" key={profile.id}><button className="secondary" onClick={() => onChoose(profile.intake)}>{profile.label}</button>
      <button className="secondary" onClick={() => { void request<DemoReplay>(`/api/demo-replays/${profile.id}`).then((value) => { setReplay(value); setIndex(0); setNotice(""); }).catch(() => setNotice("尚无该档案的完整回放，请先运行演示评测。")); }}>回放</button></div>)}
    {notice && <p>{notice}</p>}
    {replay && <section className="replay"><strong>回放 · 非实时 · {replay.snapshots[0]?.runtime.mode.toUpperCase()}</strong>
      <p className="field-hint">记录时间 {replay.recordedAt}</p>
      <label htmlFor="replay-step">第 {index + 1} / {replay.snapshots.length} 步</label>
      <input id="replay-step" type="range" min={0} max={replay.snapshots.length - 1} value={index} onChange={(event) => setIndex(Number(event.target.value))} />
      <p>{replay.snapshots[index]?.state.currentQuestion ?? "面试已完成"}</p><blockquote>{replay.snapshots[index]?.state.turns.at(-1)?.answer ?? "尚未作答"}</blockquote>
      <p>证据覆盖 {replay.snapshots[index]?.progress.coveragePercent}%</p>
      {index === replay.snapshots.length - 1 && <p>{replay.report.report.executiveSummary.assessment}</p>}
    </section>}
  </details>;
}
