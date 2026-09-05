import { clarifyWithAgent } from "../../../packages/pi-runtime/src/clarification.ts";
import type { AnswerCommand, InterviewStateResponse, InterviewStepResponse } from "../../../packages/api-contract/src/index.ts";
import { activateInterview, applyInterviewDecision, getDemoInterviewDecision, getInterviewProgress, HARD_MAX_TURNS,
  recordAnswer, recordClarification, getActiveInterviewContext, answerTurnCount, setStepExecution, type InterviewState, type InterviewStep, type TaskExecutionTrace } from "../../../packages/interview-core/src/index.ts";
import { decideNextStepWithAgent, editReportWithAgent, ModelProviderError, type TelemetryCollector } from "../../../packages/pi-runtime/src/index.ts";
import { HttpError } from "./http.ts";
import { questionId, stateVersion } from "./session.ts";
import type { InterviewStore } from "./store.ts";
import type { TelemetryHub } from "./telemetry-hub.ts";
import type { RuntimeSet } from "./configured-runtimes.ts";
import type { ProbeKnowledge } from "../../../packages/pi-runtime/src/knowledge.ts";
export class ExecutionTimeoutError extends HttpError {
  constructor() { super(503, "PROVIDER_UNAVAILABLE", "本次处理超时，回答已保留，可以重试。", true); }
}
export class InterviewExecution {
  private readonly starts = new Set<string>();
  constructor(readonly store: InterviewStore, readonly hub: TelemetryHub, readonly runtimes: RuntimeSet, readonly deadlineMs: number, readonly knowledge?: ProbeKnowledge) {
    if (!Number.isFinite(deadlineMs) || deadlineMs <= 0 || deadlineMs >= store.leaseMs) throw new Error("Execution deadline must be positive and shorter than command lease");
  }
  response(state: InterviewState, pending = true): InterviewStateResponse {
    return { state, stateVersion: stateVersion(state), runtime: this.runtimes.info,
      progress: getInterviewProgress(state, state.role.competencies.filter((c) => c.core).map((c) => c.id)),
      pendingSupplement: pending ? this.store.pendingSupplement(state) : undefined,
      questionId: questionId(state), pendingCommand: pending ? this.store.pending(state) : undefined };
  }
  private stepResponse(step: InterviewStep, commandId?: string): InterviewStepResponse {
    return { ...this.response(step.state, false), commandId, decision: step.decision, question: step.question, evidence: step.evidence };
  }
  private stateChange<T>(collector: TelemetryCollector, operation: string, fn: () => T): T {
    const span = collector.start(operation, "state");
    try { const value = fn(); collector.finish(span); return value; }
    catch (error) { collector.error(span, "state_error", error); collector.finish(span); throw error; }
  }
  private async modelCall<T>(collector: TelemetryCollector, signal: AbortSignal, operation: string, fn: (attempt: number) => Promise<T>): Promise<{ value: T; trace: TaskExecutionTrace }> {
    const first = collector.trace.spans.length;
    let attempt = 1;
    while (true) {
      signal.throwIfAborted();
      try {
        const value = await fn(attempt);
        signal.throwIfAborted();
        const stages = collector.trace.spans.slice(first).filter((span) => span.kind === "agent" && span.operation === operation);
        return { value, trace: { source: "llm", durationMs: stages.reduce((n, span) => n + (span.durationMs ?? 0), 0), retryCount: attempt - 1 } };
      } catch (error) {
        signal.throwIfAborted();
        if (!(error instanceof ModelProviderError) || attempt >= 2) throw error;
        attempt += 1;
      }
    }
  }
  private async next(state: InterviewState, collector: TelemetryCollector, signal: AbortSignal, turnId?: string) {
    if (answerTurnCount(state) >= HARD_MAX_TURNS || this.runtimes.interview.mode === "demo") {
      const span = collector.start("interview_agent", "agent", undefined, { attempt: 1 });
      const decision = answerTurnCount(state) >= HARD_MAX_TURNS ? { action: "FINISH_INTERVIEW" as const, reason: "Hard turn limit reached." } : getDemoInterviewDecision(state);
      collector.finish(span);
      const step = this.stateChange(collector, "apply_decision", () => applyInterviewDecision(state, decision, turnId));
      return { step, trace: { source: "demo" as const, durationMs: span.durationMs ?? 0, retryCount: 0 } };
    }
    const runtime = this.runtimes.interview;
    const retrievalBudget = { remaining: 2 };
    const result = await this.modelCall(collector, signal, "interview_agent", (attempt) => decideNextStepWithAgent({
      model: runtime.model!, streamFn: runtime.streamFn!, state, telemetry: collector, signal, attempt, knowledge: this.knowledge, retrievalBudget,
    }));
    return { step: this.stateChange(collector, "apply_decision", () => applyInterviewDecision(state, result.value, turnId)), trace: result.trace };
  }
  private async run<T>(state: InterviewState, operation: string, fn: (collector: TelemetryCollector, signal: AbortSignal) => Promise<T>, commandId?: string): Promise<T> {
    const collector = this.hub.create({ sessionId: state.sessionId, commandId, operation, stateVersion: stateVersion(state) });
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(new ExecutionTimeoutError()), this.deadlineMs);
    timer.unref();
    try { const result = await fn(collector, abort.signal); collector.end("succeeded"); return result; }
    catch (error) { collector.end(abort.signal.aborted ? "timed_out" : "failed"); throw error; }
    finally { clearTimeout(timer); }
  }
  async start(state: InterviewState): Promise<InterviewStepResponse> {
    if (this.starts.has(state.sessionId)) throw new HttpError(409, "STATE_CONFLICT", "Interview start is already in progress", true);
    if (state.status !== "draft") throw new HttpError(409, "STATE_CONFLICT", "Interview has already started");
    this.starts.add(state.sessionId);
    try {
      return await this.run(state, "start", async (collector, signal) => {
        const version = stateVersion(state);
        this.stateChange(collector, "activate_interview", () => activateInterview(state));
        const { step, trace } = await this.next(state, collector, signal);
        signal.throwIfAborted();
        setStepExecution(state, { ...this.runtimes.info, question: trace });
        this.stateChange(collector, "persist_state", () => this.store.save(state, version));
        return this.stepResponse(step);
      });
    } finally { this.starts.delete(state.sessionId); }
  }
  async answer(state: InterviewState, command: AnswerCommand): Promise<InterviewStepResponse> {
    const { owner, replay } = this.store.claim(state, command, () => {
      if (!state.currentQuestion || command.questionId !== questionId(state) || command.expectedStateVersion !== stateVersion(state)) throw new HttpError(409, "STATE_CONFLICT", "Question or state version is stale");
      if (command.intent === "clarify" && (state.clarifications ?? []).some((item) => item.question === state.currentQuestion)) throw new HttpError(400, "INVALID_REQUEST", "每个问题可以说明一次；你可以作答或跳过。", false);
    });
    if (replay) return replay;
    let completed = false;
    try {
      return await this.run(state, "answer", async (collector, signal) => {
        let edit: Awaited<ReturnType<typeof editReportWithAgent>> | undefined;
        let evidenceTrace: TaskExecutionTrace;
        const runtime = this.runtimes.report;
        if (command.intent === "clarify") {
          edit = { answerDisposition: "question_back", evidence: [] };
          evidenceTrace = { source: runtime.mode, durationMs: 0, retryCount: 0 };
        } else if (command.intent === "skip") {
          const { field } = getActiveInterviewContext(state);
          edit = { answerDisposition: "skip_request", evidence: [{ reportFieldIds: [field.id], claimIds: [], competencyId: field.competencyId,
            statement: "候选人选择不展开该话题。", polarity: "weakness", strength: 0, specificity: 1, evaluatorConfidence: 1,
            sourceQuote: command.answer, depthLevel: state.traces.at(-1)?.targetDepth ?? 1 }] };
          evidenceTrace = { source: runtime.mode, durationMs: 0, retryCount: 0 };
        } else if (runtime.mode === "llm") {
          const result = await this.modelCall(collector, signal, "report_agent", (attempt) => editReportWithAgent({
            model: runtime.model!, streamFn: runtime.streamFn!, state, answer: command.answer, telemetry: collector, signal, attempt,
          }));
          edit = result.value; evidenceTrace = result.trace;
        } else {
          const span = collector.start("report_agent", "agent", undefined, { attempt: 1 }); collector.finish(span);
          evidenceTrace = { source: "demo", durationMs: span.durationMs ?? 0, retryCount: 0 };
        }
        signal.throwIfAborted();
        if (edit?.answerDisposition === "question_back") {
          if ((state.clarifications ?? []).some((item) => item.question === state.currentQuestion)) {
            const rejection = new HttpError(400, "INVALID_REQUEST", "这个问题已经说明过，请作答或选择跳过。", false);
            this.store.reject(state.sessionId, command.commandId, owner, rejection);
            throw rejection;
          }
          const interview = this.runtimes.interview;
          const clarification = interview.mode === "llm" ? (await this.modelCall(collector, signal, "interview_agent", (attempt) => clarifyWithAgent({
            model: interview.model!, streamFn: interview.streamFn!, state, request: command.answer, telemetry: collector, signal, attempt,
          }))).value : "可以只选一个你亲自参与的具体例子，说明与这个问题相关的部分；不确定的地方可以直接说不清楚。";
          signal.throwIfAborted();
          const step = this.stateChange(collector, "record_clarification", () => recordClarification(state, command.answer, clarification));
          const response = this.stepResponse(step, command.commandId);
          this.stateChange(collector, "persist_answer_command_and_state", () => this.store.complete(state, command, owner, response));
          completed = true; return response;
        }
        const record = this.stateChange(collector, "apply_report_edit", () => recordAnswer(state, command.answer, edit?.evidence, edit?.answerDisposition, edit?.leads));
        collector.linkTurn(record.turn.id);
        const { step, trace } = await this.next(state, collector, signal, record.turn.id);
        signal.throwIfAborted();
        step.evidence = record.evidence;
        setStepExecution(state, { ...this.runtimes.info, evidence: evidenceTrace, question: trace });
        const response = this.stepResponse(step, command.commandId);
        this.stateChange(collector, "persist_answer_command_and_state", () => this.store.complete(state, command, owner, response));
        completed = true;
        return response;
      }, command.commandId);
    } finally { if (!completed) this.store.release(state.sessionId, command.commandId, owner); }
  }
  async supplement(state: InterviewState, command: AnswerCommand, projectId: string): Promise<InterviewStepResponse> {
    const { owner, replay } = this.store.claim(state, command, () => {
      if (state.status !== "completed" || state.turns.some((turn) => turn.kind === "supplement") || !state.candidate.projects.some((project) => project.id === projectId)
        || command.questionId !== `${state.sessionId}:supplement:${projectId}` || command.expectedStateVersion !== stateVersion(state)) throw new HttpError(409, "STATE_CONFLICT", "Supplement is stale or already submitted");
    });
    if (replay) return replay;
    let completed = false;
    try {
      return await this.run(state, "supplement", async (collector, signal) => {
        const runtime = this.runtimes.report;
        const edit = runtime.mode === "llm" ? (await this.modelCall(collector, signal, "report_agent", (attempt) => editReportWithAgent({
          model: runtime.model!, streamFn: runtime.streamFn!, state, projectId, answer: command.answer, telemetry: collector, signal, attempt,
        }))).value : undefined;
        signal.throwIfAborted();
        const record = this.stateChange(collector, "record_supplement", () => recordAnswer(state, command.answer, edit?.evidence, edit?.answerDisposition, edit?.leads, projectId));
        collector.linkTurn(record.turn.id);
        const decision = { action: "RECORD_SUPPLEMENT" as const, reason: "Post-closing candidate supplement recorded" };
        state.traces.push({ ...decision, turnId: record.turn.id });
        const response = this.stepResponse({ state, decision, evidence: record.evidence }, command.commandId);
        this.stateChange(collector, "persist_supplement", () => this.store.complete(state, command, owner, response));
        completed = true; return response;
      }, command.commandId);
    } finally { if (!completed) this.store.release(state.sessionId, command.commandId, owner); }
  }

}
