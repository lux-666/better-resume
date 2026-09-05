import type { InterviewState } from "../../../packages/interview-core/src/index.ts";
import { buildInterviewReportBundle } from "../../../packages/interview-core/src/report-output.ts";
import { demoNarrative, renderNarrativeMarkdown } from "../../../packages/interview-core/src/narrative.ts";
import type { NarrativeStatus, ReportNarrative } from "../../../packages/api-contract/src/narrative.ts";
import { generateNarrative } from "../../../packages/pi-runtime/src/narrative.ts";
import type { InterviewStore } from "./store.ts";
import type { TelemetryHub } from "./telemetry-hub.ts";
import type { ModelRuntime } from "./model-runtime.ts";
import { stateVersion } from "./session.ts";
type Row = { state_version: number; status: NarrativeStatus; result: string | null; trace_id: string };
export class NarrativeService {
  private readonly jobs = new Map<string, { version: number; abort: AbortController; promise: Promise<void> }>();
  constructor(private readonly store: InterviewStore, private readonly hub: TelemetryHub, private readonly runtime: ModelRuntime, private readonly timeoutMs = 90_000) {}
  private row(id: string): Row | undefined { return this.store.database.prepare("SELECT * FROM report_narratives WHERE session_id=?").get(id) as Row | undefined; }
  ensure(state: InterviewState, retry = false): void {
    if (state.status !== "completed") return;
    const version = stateVersion(state);
    const row = this.row(state.sessionId);
    if (row?.state_version === version && (row.status !== "failed" || !retry)) return;
    const old = this.jobs.get(state.sessionId);
    if (old?.version === version) return;
    old?.abort.abort(new Error("Narrative source version changed"));
    const collector = this.hub.create({ sessionId: state.sessionId, operation: "narrative", stateVersion: version });
    this.store.database.prepare("INSERT OR REPLACE INTO report_narratives VALUES(?,?,'pending',NULL,?)").run(state.sessionId, version, collector.trace.traceId);
    const abort = new AbortController();
    const promise = Promise.resolve().then(async () => {
      const timer = setTimeout(() => abort.abort(new Error("Narrative deadline exceeded")), this.timeoutMs); timer.unref();
      try {
        const report = buildInterviewReportBundle(state).report;
        let narrative: ReportNarrative | undefined;
        if (this.runtime.mode === "demo") {
          const span = collector.start("narrative_agent", "agent", undefined, { attempt: 1 }); narrative = demoNarrative(report); collector.finish(span);
        } else {
          for (let attempt = 1; attempt <= 2; attempt++) {
            try { narrative = await generateNarrative({ model: this.runtime.model!, streamFn: this.runtime.streamFn!, report, telemetry: collector, signal: abort.signal, attempt }); break; }
            catch (error) { abort.signal.throwIfAborted(); if (attempt === 2) throw error; }
          }
        }
        abort.signal.throwIfAborted();
        const span = collector.start("persist_narrative", "state");
        const saved = this.store.database.prepare("UPDATE report_narratives SET status='ready',result=? WHERE session_id=? AND state_version=? AND trace_id=?")
          .run(JSON.stringify(narrative), state.sessionId, version, collector.trace.traceId);
        collector.finish(span); collector.end(Number(saved.changes) === 1 ? "succeeded" : "interrupted");
      } catch {
        this.store.database.prepare("UPDATE report_narratives SET status='failed' WHERE session_id=? AND state_version=? AND trace_id=?").run(state.sessionId, version, collector.trace.traceId);
        collector.end(abort.signal.aborted ? "timed_out" : "failed");
      } finally { clearTimeout(timer); if (this.jobs.get(state.sessionId)?.promise === promise) this.jobs.delete(state.sessionId); }
    });
    this.jobs.set(state.sessionId, { version, abort, promise });
  }
  bundle(state: InterviewState) {
    const time = this.store.database.prepare("SELECT updated_at FROM sessions WHERE id=?").get(state.sessionId) as { updated_at: string };
    const bundle = buildInterviewReportBundle(state, { generatedAt: time.updated_at });
    const row = this.row(state.sessionId);
    bundle.report.narrativeStatus = row?.state_version === stateVersion(state) ? row.status : "not_requested";
    if (row?.state_version === stateVersion(state)) {
      bundle.report.narrativeSourceVersion = row.state_version;
      if (row.status === "ready" && row.result) { bundle.report.narrative = JSON.parse(row.result); bundle.markdown += "\n" + renderNarrativeMarkdown(bundle.report.narrative!); }
      if (row.status === "failed") { bundle.report.limitations.push("叙述层生成失败，可重试；确定性报告仍可使用。"); bundle.markdown += "\n叙述层生成失败，可重试；确定性报告仍可使用。\n"; }
    }
    return bundle;
  }
  async close(): Promise<void> { for (const job of this.jobs.values()) job.abort.abort(); await Promise.all([...this.jobs.values()].map((job) => job.promise)); }
}
