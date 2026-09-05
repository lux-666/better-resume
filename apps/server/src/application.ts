import { demoProfiles, demoReplay } from "./demo-profiles.ts";
import { NarrativeService } from "./narrative-service.ts";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { Check } from "typebox/value";
import { AnswerCommandSchema, SupplementCommandSchema, CreateInterviewBodySchema, type AnswerCommand, type CreateInterviewBody } from "../../../packages/api-contract/src/index.ts";
import { buildCandidateFromIntake, buildInterviewRole, buildInterviewReportBundle, createInterviewState, normalizeInterviewIntake } from "../../../packages/interview-core/src/index.ts";
import { EvidenceValidationError, ModelProviderError } from "../../../packages/pi-runtime/src/index.ts";
import { summarizeTelemetry } from "../../../packages/api-contract/src/telemetry-summary.ts";
import { HttpError, json, readJson } from "./http.ts";
import { InterviewStore } from "./store.ts";
import { TelemetryHub } from "./telemetry-hub.ts";
import { InterviewExecution } from "./execution.ts";
import { configuredRuntimes, type RuntimeSet } from "./configured-runtimes.ts";
export function createApplication(options: { databasePath: string; runtimes?: RuntimeSet; leaseMs?: number; deadlineMs?: number }) {
  const store = new InterviewStore(options.databasePath, options.leaseMs);
  store.recoverTelemetry();
  const hub = new TelemetryHub(store);
  const runtimes = options.runtimes ?? configuredRuntimes();
  const narratives = new NarrativeService(store, hub, runtimes.report, options.deadlineMs);
  const execution = new InterviewExecution(store, hub, runtimes, options.deadlineMs ?? Math.min(90_000, store.leaseMs * .75));
  const server = createServer(async (request, response) => {
    try {
      const method = request.method ?? "GET";
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      if (method === "GET" && pathname === "/api/health") return json(response, 200, { ok: true, runtime: runtimes.info });
      if (method === "GET" && pathname === "/api/demo-profiles") return json(response, 200, demoProfiles());
      const replayMatch = pathname.match(/^\/api\/demo-replays\/([\w-]+)$/);
      if (method === "GET" && replayMatch) { const replay = demoReplay(replayMatch[1]); if (!replay) throw new HttpError(404, "NOT_FOUND", "Replay not available"); return json(response, 200, replay); }
      if (method === "POST" && pathname === "/api/interviews") {
        const body = await readJson(request);
        if (!Check(CreateInterviewBodySchema, body)) throw new HttpError(400, "INVALID_REQUEST", "Create interview body is invalid");
        const intake = normalizeInterviewIntake(body as CreateInterviewBody);
        const role = buildInterviewRole({ job: intake.job });
        const state = createInterviewState(randomUUID(), role, buildCandidateFromIntake(intake, role), intake);
        state.phaseVersion = 3;
        store.create(state);
        return json(response, 201, execution.response(state));
      }
      const traceMatch = pathname.match(/^\/api\/traces\/([\w-]+)$/);
      if (method === "GET" && traceMatch) {
        const trace = store.trace(traceMatch[1]);
        if (!trace) throw new HttpError(404, "NOT_FOUND", "Trace not found");
        return json(response, 200, trace);
      }
      const match = pathname.match(/^\/api\/interviews\/([\w-]+)\/(start|answer|supplement|state|report|report-retry|traces|telemetry|progress|events)$/);
      if (!match) throw new HttpError(404, "NOT_FOUND", "Route not found");
      const state = store.load(match[1]);
      if (!state) throw new HttpError(404, "NOT_FOUND", "Interview not found");
      const action = match[2];
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
        if (action === "telemetry") { const traces = hub.traces(state.sessionId); return json(response, 200, { traces, summary: summarizeTelemetry(traces) }); }
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
  return { server, store, hub, execution, narratives, close: async () => { hub.close(); await narratives.close(); server.close(); store.close(); } };
}
