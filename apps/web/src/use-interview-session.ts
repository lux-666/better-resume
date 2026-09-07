import { useEffect, useRef, useState } from "react";
import type { AnswerCommand, InterviewStateResponse, InterviewStepResponse } from "@better-resume/api-contract";
import { ApiRequestError, post, request } from "./api.ts";
import { useRunProgress } from "./use-run-progress.ts";
const sessionStorageKey = "better-resume-session-id";
type BusyAction = "create" | "start" | "submit";
export function useInterviewSession() {
  const [session, setSession] = useState<InterviewStateResponse>();
  const [answer, setAnswer] = useState("");
  const [pendingCommandId, setPendingCommandId] = useState("");
  const [busyAction, setBusyAction] = useState<BusyAction>();
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  const pending = useRef<AnswerCommand | undefined>(undefined);
  const currentSessionId = useRef<string | undefined>(undefined);
  currentSessionId.current = session?.state.sessionId;
  const navigation = useRef(0);
  const observation = useRunProgress(session?.state.sessionId);
  const run = pendingCommandId ? observation.runs.findLast((item) => item.commandId === pendingCommandId)
    : observation.runs.findLast((item) => item.operation !== "narrative");
  const isProcessing = Boolean(busyAction) || run?.status === "running";
  function clear(): void {
    navigation.current++; currentSessionId.current = undefined; pending.current = undefined;
    setSession(undefined); setPendingCommandId(""); setAnswer(""); setError(""); localStorage.removeItem(sessionStorageKey);
  }
  async function open(id: string): Promise<void> {
    if (busyRef.current || isProcessing) return;
    const requestVersion = ++navigation.current;
    const restored = await request<InterviewStateResponse>(`/api/interviews/${id}/state`);
    if (navigation.current === requestVersion) { setError(""); restore(restored); }
  }
  function restore(restored: InterviewStateResponse): void {
    currentSessionId.current = restored.state.sessionId;
    localStorage.setItem(sessionStorageKey, restored.state.sessionId);
    pending.current = restored.pendingCommand;
    setSession(restored); setPendingCommandId(restored.pendingCommand?.commandId ?? ""); setAnswer(restored.pendingCommand?.answer ?? "");
  }
  useEffect(() => {
    const id = localStorage.getItem(sessionStorageKey);
    if (!id) return;
    let disposed = false;
    const requestVersion = navigation.current;
    void request<InterviewStateResponse>(`/api/interviews/${id}/state`).then((state) => { if (!disposed && navigation.current === requestVersion) restore(state); }).catch((cause) => {
      if (disposed) return;
      if (cause instanceof ApiRequestError && cause.code === "NOT_FOUND") localStorage.removeItem(sessionStorageKey);
      else setError(cause instanceof Error ? cause.message : "恢复失败");
    });
    return () => { disposed = true; };
  }, []);
  useEffect(() => {
    if (!run || run.status === "running" || !session || session.stateVersion > (run.stateVersion ?? -1)) return;
    const id = session.state.sessionId;
    let disposed = false;
    void request<InterviewStateResponse>(`/api/interviews/${id}/state`).then((state) => {
      if (!disposed && currentSessionId.current === id) restore(state);
    }).catch(() => {});
    return () => { disposed = true; };
  }, [run?.traceId, run?.status, session?.stateVersion]);
  async function runOnce(action: BusyAction, operation: () => Promise<void>): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = true; setBusyAction(action);
    try { await operation(); } finally { busyRef.current = false; setBusyAction(undefined); }
  }
  async function start(): Promise<void> {
    if (!session || isProcessing) return;
    const id = session.state.sessionId;
    await runOnce("start", async () => {
      try { setError(""); restore(await post<InterviewStepResponse>(`/api/interviews/${id}/start`)); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "启动失败"); }
    });
  }
  function submit(intent: AnswerCommand["intent"] = "answer"): void {
    if (!session?.questionId || (intent === "answer" && !answer.trim()) || isProcessing) return;
    const id = session.state.sessionId;
    void runOnce("submit", async () => {
      const command: AnswerCommand = pending.current ?? { commandId: pendingCommandId || crypto.randomUUID(), questionId: session.questionId!, expectedStateVersion: session.stateVersion, answer: intent === "finish" ? "没有其他补充，结束面试。" : intent === "skip" ? "我想跳过这个问题。" : intent === "clarify" ? answer.trim() || "请说明这个问题的含义或范围。" : answer, ...(intent !== "answer" ? { intent } : {}) };
      pending.current = command;
      setPendingCommandId(command.commandId);
      try {
        setError(""); restore(await post<InterviewStepResponse>(`/api/interviews/${id}/answer`, command));
      } catch (cause) {
        try { restore(await request<InterviewStateResponse>(`/api/interviews/${id}/state`)); }
        catch { /* Preserve the exact pending command until authoritative state is reachable. */ }
        setError(cause instanceof Error ? cause.message : "连接中断，正在核对提交状态");
      }
    });
  }
  return { session, answer, setAnswer, pendingCommandId, busyAction, busyRef,
    error, setError, restore, clear, open, runOnce, start, submit, run, isProcessing, connection: observation.connection };
}
