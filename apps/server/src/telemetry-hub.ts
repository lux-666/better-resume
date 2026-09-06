import type { ServerResponse } from "node:http";
import { TelemetryCollector } from "../../../packages/pi-runtime/src/telemetry.ts";
import type { TelemetryTrace } from "../../../packages/api-contract/src/telemetry.ts";
import { projectRunProgress } from "../../../packages/api-contract/src/telemetry-summary.ts";
import type { InterviewStore } from "./store.ts";
export class TelemetryHub {
  private readonly connections = new Map<string, Set<ServerResponse>>();
  private readonly active = new Map<string, TelemetryTrace>();
  constructor(private readonly store: InterviewStore) {}
  create(ids: Pick<TelemetryTrace, "sessionId" | "commandId" | "operation" | "stateVersion">): TelemetryCollector {
    const collector = new TelemetryCollector(ids);
    collector.subscribe((trace) => this.publish(trace));
    this.publish(collector.trace);
    return collector;
  }
  private publish(trace: TelemetryTrace): void {
    if (trace.status === "running") this.active.set(trace.traceId, trace);
    else this.active.delete(trace.traceId);
    try { this.store.saveTrace(trace); } catch { console.error("Telemetry snapshot could not be saved"); }
    for (const response of this.connections.get(trace.sessionId ?? "") ?? []) {
      this.send(response, `id: ${trace.traceId}:${trace.revision}\nevent: progress\ndata: ${JSON.stringify(projectRunProgress(trace))}\n\n`);
    }
  }
  isBusy(sessionId: string): boolean { return [...this.active.values()].some((trace) => trace.sessionId === sessionId && trace.operation !== "narrative"); }
  disconnect(sessionId: string): void { for (const response of this.connections.get(sessionId) ?? []) response.end(); this.connections.delete(sessionId); }
  traces(sessionId: string): TelemetryTrace[] {
    const traces = new Map(this.store.traces(sessionId).map((trace) => [trace.traceId, trace]));
    for (const trace of this.active.values()) if (trace.sessionId === sessionId) traces.set(trace.traceId, trace);
    return [...traces.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  }
  progress(sessionId: string) { return this.traces(sessionId).slice(-20).map((trace) => projectRunProgress(trace)); }
  private send(response: ServerResponse, data: string): void {
    if (response.destroyed || response.writableEnded) return;
    if (!response.write(data)) response.destroy();
  }
  connect(sessionId: string, response: ServerResponse): void {
    response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" });
    response.flushHeaders();
    const set = this.connections.get(sessionId) ?? new Set();
    this.connections.set(sessionId, set); set.add(response);
    this.send(response, `event: snapshot\ndata: ${JSON.stringify(this.progress(sessionId))}\n\n`);
    const heartbeat = setInterval(() => this.send(response, ": connected\n\n"), 10_000);
    heartbeat.unref();
    response.on("close", () => { clearInterval(heartbeat); set.delete(response); if (!set.size) this.connections.delete(sessionId); });
  }
  close(): void { for (const set of this.connections.values()) for (const response of set) response.end(); this.connections.clear(); }
}
