import { SessionMemory } from "./session-memory.ts";
import { runModelStage } from "./model-stage.ts";
import { generateRolePack } from "../../../packages/pi-runtime/src/role-pack.ts";
import { applyRolePack } from "../../../packages/interview-core/src/role-pack.ts";
import { demoProfiles, demoReplay } from "./demo-profiles.ts";
import { NarrativeService } from "./narrative-service.ts";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { Check } from "typebox/value";
import { AnswerCommandSchema, SupplementCommandSchema, getCreateInterviewError, type AnswerCommand, type CreateInterviewBody } from "../../../packages/api-contract/src/index.ts";
import { buildCandidateFromIntake, buildInterviewRole, createInterviewState, normalizeInterviewIntake } from "../../../packages/interview-core/src/index.ts";
import { EvidenceValidationError, ModelProviderError } from "../../../packages/pi-runtime/src/index.ts";
import { summarizeTelemetry } from "../../../packages/api-contract/src/telemetry-summary.ts";
import { HttpError, json, readJson } from "./http.ts";
import { InterviewStore } from "./store.ts";
import { TelemetryHub } from "./telemetry-hub.ts";
import { InterviewExecution } from "./execution.ts";
import { configuredRuntimes, type RuntimeSet } from "./configured-runtimes.ts";
import { fileURLToPath } from "node:url";
import { configuredEmbedding } from "./embedding.ts";
import { configuredReranker } from "./rerank.ts";
import { KnowledgeQuerySchema } from "../../../packages/pi-runtime/src/knowledge.ts";
import { KnowledgeStore } from "./knowledge-store.ts";
import { extractJobFields } from "./job-intake.ts";
export function createApplication(options: { databasePath: string; runtimes?: RuntimeSet; leaseMs?: number; deadlineMs?: number; knowledgeRoot?: string; embedding?: ReturnType<typeof configuredEmbedding>; reranker?: ReturnType<typeof configuredReranker> }) {
  const store = new InterviewStore(options.databasePath, options.leaseMs);
  store.recoverTelemetry();
  const hub = new TelemetryHub(store);
  const runtimes = options.runtimes ?? configuredRuntimes();
  const narratives = new NarrativeService(store, hub, runtimes.report, options.deadlineMs, runtimes.fallback);
  const embedding = options.embedding ?? (options.runtimes ? undefined : configuredEmbedding());
  const memory = new SessionMemory(store.database, embedding);
  const lifecycle = new Set<string>();
  const reranker = options.reranker ?? (options.runtimes ? undefined : configuredReranker());
  const knowledge = new KnowledgeStore(store.database, embedding, reranker);
  const indexingAbort = new AbortController();
  const ready = knowledge.index(options.knowledgeRoot ?? fileURLToPath(new URL("../../../knowledge", import.meta.url)), indexingAbort.signal)
    .catch(() => { console.error("Knowledge indexing failed; static playbook is active. Check knowledge files and embedding configuration."); });
  const execution = new InterviewExecution(store, hub, runtimes, options.deadlineMs ?? Math.min(90_000, store.leaseMs * .75), knowledge, memory);
  const server = createServer(async (request, response) => {
    try {
      const method = request.method ?? "GET";
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      if (method === "GET" && pathname === "/api/health") return json(response, 200, { ok: true, runtime: runtimes.info, knowledge: knowledge.health() });
      if (method === "POST" && pathname === "/api/intake/job") {
        const body = await readJson(request);
        if (typeof body.text !== "string" || !body.text.trim() || body.text.length > 100_000) throw new HttpError(400, "INVALID_REQUEST", "JD 文本不能为空且不能超过 100,000 字符");
        return json(response, 200, await extractJobFields(body.text, runtimes.report, AbortSignal.timeout(options.deadlineMs ?? 180_000)));
      }
      if (method === "POST" && pathname === "/api/knowledge/search") {
        const body = await readJson(request);
        if (!Check(KnowledgeQuerySchema, body) || !body.query.trim()) throw new HttpError(400, "INVALID_REQUEST", "Knowledge query is invalid");
        try { return json(response, 200, { hits: await knowledge.retrieve(body) }); }
        catch { throw new HttpError(503, "PROVIDER_UNAVAILABLE", "Knowledge retrieval unavailable; static playbook is active", true); }
      }
      if (method === "GET" && pathname === "/api/demo-profiles") return json(response, 200, demoProfiles());
      const replayMatch = pathname.match(/^\/api\/demo-replays\/([\w-]+)$/);
      if (method === "GET" && replayMatch) { const replay = demoReplay(replayMatch[1]); if (!replay) throw new HttpError(404, "NOT_FOUND", "Replay not available"); return json(response, 200, replay); }
      if (method === "GET" && pathname === "/api/interviews") return json(response, 200, { sessions: store.history() });
      if (method === "GET" && pathname === "/api/metrics") return json(response, 200, summarizeTelemetry(store.history().flatMap((s) => hub.traces(s.sessionId))));
      if (method === "POST" && pathname === "/api/interviews") {
        const value = await readJson(request);
        const validationError = getCreateInterviewError(value);
        if (validationError) throw new HttpError(400, "INVALID_REQUEST", validationError);
        const body = value as CreateInterviewBody;
        const intake = normalizeInterviewIntake(body);
        const role = buildInterviewRole({ job: intake.job });
        const state = createInterviewState(randomUUID(), role, buildCandidateFromIntake(intake, role), intake);
        state.phaseVersion = 3;
        state.timeBudgetMinutes = body.timeBudgetMinutes;
        state.maxTurns = body.maxTurns;
        if (intake.job) state.rolePackFailure = "岗位调查计划创建尚未完成或已中断，当前使用通用调查字段。";
        if (body.resume) state.resumeIndexFailure = "简历索引创建尚未完成或已中断。";
        store.create(state);
        lifecycle.add(state.sessionId);
        const collector = hub.create({ sessionId: state.sessionId, operation: "create", stateVersion: 0 });
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(new Error("Creation deadline exceeded")), options.deadlineMs ?? 90_000); timer.unref();
        try {
          if (intake.job) {
            try {
              if (runtimes.report.mode !== "llm") throw new Error("Demo mode");
              const result = await runModelStage({ primary: runtimes.report, fallback: runtimes.fallback, telemetry: collector, signal: abort.signal,
                primaryTimeoutMs: (options.deadlineMs ?? 90_000) * .5,
                invoke: (runtime, attempt, signal) => generateRolePack({ model: runtime.model!, streamFn: runtime.streamFn!, state, telemetry: collector, signal, attempt }) });
              applyRolePack(state, result.value); delete state.rolePackFailure;
            } catch { state.rolePackFailure = "岗位调查计划未生成，当前使用通用四维调查，不代表逐条岗位匹配。"; }
          }
          if (body.resume) {
            try { await memory.saveResume(state.sessionId, body.resume.text, collector, abort.signal); delete state.resumeIndexFailure; }
            catch { state.resumeIndexFailure = "简历全文索引失败，未保留全文；本次只使用已填写的项目资料。"; }
          }
          store.save(state, 0); collector.end(abort.signal.aborted ? "timed_out" : state.rolePackFailure || state.resumeIndexFailure ? "failed" : "succeeded");
          return json(response, 201, execution.response(state));
        } finally { clearTimeout(timer); lifecycle.delete(state.sessionId); }
      }
      const sessionMatch = pathname.match(/^\/api\/interviews\/([\w-]+)$/);
      if (method === "DELETE" && sessionMatch) {
        const id = sessionMatch[1];
        if (!store.load(id)) throw new HttpError(404, "NOT_FOUND", "Interview not found");
        if (lifecycle.has(id) || execution.isBusy(id) || hub.isBusy(id) || store.hasActiveCommand(id)) throw new HttpError(409, "STATE_CONFLICT", "会话正在处理，请完成后再删除。", true);
        lifecycle.add(id);
        try { await narratives.cancel(id); hub.disconnect(id); store.deleteSession(id); return json(response, 200, { deleted: true }); }
        finally { lifecycle.delete(id); }
      }
      const traceMatch = pathname.match(/^\/api\/traces\/([\w-]+)$/);
      if (method === "GET" && traceMatch) {
        const trace = store.trace(traceMatch[1]);
        if (!trace) throw new HttpError(404, "NOT_FOUND", "Trace not found");
        return json(response, 200, trace);
      }
      const match = pathname.match(/^\/api\/interviews\/([\w-]+)\/(start|answer|supplement|state|report|report-retry|traces|telemetry|progress|events|export|resume-index)$/);
      if (!match) throw new HttpError(404, "NOT_FOUND", "Route not found");
      if (lifecycle.has(match[1])) throw new HttpError(409, "STATE_CONFLICT", "会话正在创建或删除，请稍后重试。", true);
      const state = store.load(match[1]);
      if (!state) throw new HttpError(404, "NOT_FOUND", "Interview not found");
      const action = match[2];
      if (method === "DELETE" && action === "resume-index") {
        if (hub.isBusy(state.sessionId) || store.hasActiveCommand(state.sessionId)) throw new HttpError(409, "STATE_CONFLICT", "回答正在处理，请完成后删除索引。", true);
        memory.deleteResume(state.sessionId); return json(response, 200, memory.resumeInfo(state.sessionId));
      }
      if (method === "GET" && action === "export") return json(response, 200, store.exportSession(state.sessionId));
      if (method === "POST" && action === "start") return json(response, 200, await execution.start(state));
      if (method === "POST" && action === "answer") {
        const body = await readJson(request);
        if (!Check(AnswerCommandSchema, body) || !body.answer.trim()) throw new HttpError(400, "INVALID_REQUEST", "Answer command is invalid");
        const result = await execution.answer(state, { ...body, answer: body.answer.trim() } as AnswerCommand);
        try { narratives.ensure(result.state); } catch { console.error("Narrative scheduling failed; committed interview preserved"); }
        return json(response, 200, result);
      }
      if (method === "POST" && action === "supplement") {
        const body = await readJson(request);
        if (!Check(SupplementCommandSchema, body) || !body.answer.trim()) throw new HttpError(400, "INVALID_REQUEST", "Supplement command is invalid");
        const result = await execution.supplement(state, { ...body, answer: body.answer.trim() }, body.projectId);
        try { narratives.ensure(result.state); } catch { console.error("Narrative scheduling failed; committed interview preserved"); }
        return json(response, 200, result);
      }
      if (method === "POST" && action === "report-retry") { narratives.ensure(state, true); return json(response, 200, narratives.bundle(state)); }
      if (method === "GET") {
        if (action === "state") return json(response, 200, execution.response(state));
        if (action === "report") { narratives.ensure(state); return json(response, 200, narratives.bundle(state)); }
        if (action === "traces") return json(response, 200, hub.traces(state.sessionId));
        if (action === "telemetry") { const traces = hub.traces(state.sessionId); return json(response, 200, { traces, summary: summarizeTelemetry(traces), knowledge: knowledge.health() }); }
        if (action === "progress") return json(response, 200, hub.progress(state.sessionId));
        if (action === "events") return hub.connect(state.sessionId, response);
      }
      throw new HttpError(404, "NOT_FOUND", "Route not found");
    } catch (error) {
      const failure = error instanceof HttpError ? error
        : error instanceof EvidenceValidationError ? new HttpError(422, "MODEL_OUTPUT_INVALID", "本次处理未通过校验，回答已保留，可以重试。", true)
        : error instanceof ModelProviderError ? new HttpError(503, "PROVIDER_UNAVAILABLE", "模型服务暂不可用，回答已保留，可以重试。", true)
        : error instanceof SyntaxError ? new HttpError(400, "INVALID_REQUEST", "Request body is not valid JSON")
        : new HttpError(500, "INTERNAL_ERROR", "Internal server error", true);
      json(response, failure.status, { code: failure.code, message: failure.message, retryable: failure.retryable });
    }
  });
  return { server, store, hub, execution, narratives, knowledge, memory, ready, close: async () => { indexingAbort.abort(); await ready; hub.close(); await narratives.close(); server.close(); store.close(); } };
}
