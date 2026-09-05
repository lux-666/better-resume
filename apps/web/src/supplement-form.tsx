import { useRef, useState } from "react";
import type { InterviewStateResponse, InterviewStepResponse } from "@better-resume/api-contract";
import { post } from "./api.ts";
export function SupplementForm({ session, onComplete }: { session: InterviewStateResponse; onComplete: (state: InterviewStateResponse) => void }) {
  const [projectId, setProjectId] = useState(session.pendingSupplement?.projectId ?? session.state.candidate.projects[0]?.id ?? "");
  const [answer, setAnswer] = useState(session.pendingSupplement?.answer ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const command = useRef<{ commandId: string; questionId: string; expectedStateVersion: number; answer: string; projectId: string } | undefined>(session.pendingSupplement);
  const pending = useRef(false);
  if (session.state.turns.some((turn) => turn.kind === "supplement")) return <p>你的补充已保存，并已更新报告。</p>;
  return <details><summary>补充一条项目事实（可选）</summary>
    <p className="field-hint">只需补充此前未说明的事实。提交后更新报告，不重新开始提问。</p>
    <select aria-label="补充所属项目" value={projectId} disabled={busy || Boolean(command.current)} onChange={(event) => setProjectId(event.target.value)}>
      {session.state.candidate.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
    </select><textarea aria-label="补充事实" value={answer} maxLength={10000} disabled={busy || Boolean(command.current)} onChange={(event) => setAnswer(event.target.value)} />
    <button disabled={busy || !answer.trim()} onClick={() => {
      if (pending.current) return;
      pending.current = true; setBusy(true); setError("");
      command.current ??= { commandId: crypto.randomUUID(), questionId: `${session.state.sessionId}:supplement:${projectId}`, expectedStateVersion: session.stateVersion, answer, projectId };
      void post<InterviewStepResponse>(`/api/interviews/${session.state.sessionId}/supplement`, command.current)
        .then(onComplete).catch((cause) => setError(cause instanceof Error ? cause.message : "补充提交失败，可以重试"))
        .finally(() => { pending.current = false; setBusy(false); });
    }}>{busy ? "正在处理补充…" : command.current ? "重试补充" : "提交补充"}</button>{error && <p className="error">{error}</p>}
  </details>;
}
