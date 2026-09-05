import { useEffect, useState } from "react";
import type { RunProgress } from "../../../packages/api-contract/src/telemetry.ts";
import { request } from "./api.ts";
export function mergeProgress(current: RunProgress[], incoming: RunProgress[]): RunProgress[] {
  const runs = new Map(current.map((run) => [run.traceId, run]));
  for (const run of incoming) {
    const previous = runs.get(run.traceId);
    if (!previous || run.revision >= previous.revision) runs.set(run.traceId, run);
  }
  return [...runs.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt)).slice(-30);
}
export function useRunProgress(sessionId?: string) {
  const [runs, setRuns] = useState<RunProgress[]>([]);
  const [connection, setConnection] = useState<"connecting" | "live" | "reconnecting">("connecting");
  useEffect(() => {
    setRuns([]); setConnection("connecting");
    if (!sessionId) return;
    let disposed = false;
    let polling: ReturnType<typeof setInterval> | undefined;
    const accept = (items: RunProgress[]) => { if (!disposed) setRuns((current) => mergeProgress(current, items)); };
    const sync = () => { void request<RunProgress[]>(`/api/interviews/${sessionId}/progress`).then(accept).catch(() => {}); };
    const source = new EventSource(`/api/interviews/${sessionId}/events`);
    source.addEventListener("snapshot", (event) => {
      accept(JSON.parse(event.data)); setConnection("live"); clearInterval(polling); polling = undefined;
    });
    source.addEventListener("progress", (event) => accept([JSON.parse(event.data)]));
    source.onerror = () => {
      if (disposed) return;
      setConnection("reconnecting"); sync();
      polling ??= setInterval(sync, 2_000);
    };
    return () => { disposed = true; source.close(); clearInterval(polling); };
  }, [sessionId]);
  return { runs, connection };
}
