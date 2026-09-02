import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Check } from "typebox/value";
import {
  AnswerCommandSchema,
  CreateInterviewBodySchema,
  type AnswerCommand,
  type ApiError,
  type CreateInterviewBody,
  type InterviewStateResponse,
  type InterviewStepResponse,
  type RuntimeInfo,
} from "../../../packages/api-contract/src/index.ts";
import {
  activateInterview,
  applyInterviewDecision,
  buildCandidateFromIntake,
  buildInterviewRole,
  createLegacyInterviewRole,
  createInterviewState,
  getDemoInterviewDecision,
  getInterviewProgress,
  HARD_MAX_TURNS,
  recordAnswer,
  setStepExecution,
  normalizeInterviewIntake,
  type InterviewState,
  type InterviewStep,
  type StepExecutionTrace,
  type TaskExecutionTrace,
} from "../../../packages/interview-core/src/index.ts";
import {
  decideNextStepWithAgent,
  editReportWithAgent,
  EvidenceValidationError,
  ModelProviderError,
  TelemetryCollector,
  type TelemetryTrace,
  withOneProviderRetry,
} from "../../../packages/pi-runtime/src/index.ts";
import { createModelRuntime, resolveAgentModelIds } from "./model-runtime.ts";

const port = Number(process.env.PORT ?? 3000);
const databasePath = resolve(process.env.DATABASE_PATH ?? "data/better-resume.db");
mkdirSync(dirname(databasePath), { recursive: true });

const database = new DatabaseSync(databasePath);
database.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
database.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS answer_commands (
    session_id TEXT NOT NULL,
    command_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    expected_state_version INTEGER NOT NULL,
    answer TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed')),
    response TEXT,
    lease_owner TEXT,
    lease_expires_at INTEGER,
    created_at TEXT NOT NULL,
    PRIMARY KEY (session_id, command_id),
    UNIQUE (session_id, question_id)
  );
  CREATE TABLE IF NOT EXISTS telemetry_traces (
    trace_id TEXT PRIMARY KEY,
    session_id TEXT,
    command_id TEXT,
    turn_id TEXT,
    trace TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

function ensureAnswerCommandColumn(name: string, definition: string): void {
  const hasColumn = () => (database.prepare("PRAGMA table_info(answer_commands)").all() as Array<{ name: string }>)
    .some((column) => column.name === name);
  if (hasColumn()) return;
  try {
    database.exec(`ALTER TABLE answer_commands ADD COLUMN ${definition}`);
  } catch (error) {
    if (!hasColumn()) throw error;
  }
}
ensureAnswerCommandColumn("lease_owner", "lease_owner TEXT");
ensureAnswerCommandColumn("lease_expires_at", "lease_expires_at INTEGER");

const defaultRuntime = createModelRuntime();
const agentModelIds = defaultRuntime.mode === "llm" ? resolveAgentModelIds() : undefined;
const reportRuntime = agentModelIds
  ? createModelRuntime(process.env, agentModelIds.reportModelId)
  : defaultRuntime;
const interviewRuntime = agentModelIds
  ? createModelRuntime(process.env, agentModelIds.interviewModelId)
  : defaultRuntime;
if (reportRuntime.provider !== interviewRuntime.provider) throw new Error("Agent models must use one provider");
const sharedModelId = agentModelIds?.reportModelId === agentModelIds?.interviewModelId
  ? agentModelIds?.reportModelId
  : undefined;
const runtimeInfo: RuntimeInfo = {
  mode: defaultRuntime.mode,
  ...(defaultRuntime.provider ? { provider: defaultRuntime.provider } : {}),
  ...(sharedModelId ? { modelId: sharedModelId } : {}),
  ...(agentModelIds ? {
    reportModelId: agentModelIds.reportModelId,
    interviewModelId: agentModelIds.interviewModelId,
  } : {}),
};
const commandLeaseOwner = randomUUID();
// ponytail: a fixed lease avoids a heartbeat; raise this if provider calls can legitimately exceed it.
const commandLeaseMs = Number(process.env.COMMAND_LEASE_MS ?? 120_000);
if (!Number.isFinite(commandLeaseMs) || commandLeaseMs <= 0) throw new Error("COMMAND_LEASE_MS must be positive");

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiError["code"],
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function errorJson(response: ServerResponse, error: HttpError): void {
  json(response, error.status, { code: error.code, message: error.message, retryable: error.retryable } satisfies ApiError);
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new HttpError(400, "INVALID_REQUEST", "Request body is too large");
  }
  if (!body) return {};
  const value: unknown = JSON.parse(body);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "INVALID_REQUEST", "JSON body must be an object");
  }
  return value as Record<string, unknown>;
}

function hydrateState(state: InterviewState): InterviewState {
  if (!state.role) state.role = createLegacyInterviewRole(state.roleId, state.candidate);
  state.intake = normalizeInterviewIntake({
    candidate: {
      name: state.intake?.candidate?.name ?? state.candidate.name,
      skills: state.intake?.candidate?.skills ?? state.candidate.skills,
      projects: state.candidate.projects.map((project, index) => ({
        name: state.intake?.candidate?.projects?.[index]?.name ?? project.name,
        description: state.intake?.candidate?.projects?.[index]?.description ?? project.description,
      })),
    },
    ...(state.intake?.job ? { job: state.intake.job } : {}),
  });
  return state;
}

function loadState(id: string): InterviewState | undefined {
  const row = database.prepare("SELECT state FROM sessions WHERE id = ?").get(id) as
    | { state: string }
    | undefined;
  return row ? hydrateState(JSON.parse(row.state) as InterviewState) : undefined;
}

function saveState(state: InterviewState): void {
  database
    .prepare("UPDATE sessions SET state = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(state), new Date().toISOString(), state.sessionId);
}

function saveTelemetry(trace: TelemetryTrace): void {
  database.prepare(`
    INSERT OR REPLACE INTO telemetry_traces (trace_id, session_id, command_id, turn_id, trace, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(trace.traceId, trace.sessionId ?? null, trace.commandId ?? null, trace.turnId ?? null,
    JSON.stringify(trace), trace.startedAt);
}

function observeStateChange<T>(telemetry: TelemetryCollector, operation: string, change: () => T): T {
  const span = telemetry.start(operation, "state");
  try {
    const value = change();
    telemetry.finish(span);
    return value;
  } catch (error) {
    telemetry.error(span, "state_error", error);
    telemetry.finish(span);
    throw error;
  }
}

function stateVersion(state: InterviewState): number {
  return state.traces.length;
}

function questionId(state: InterviewState): string | undefined {
  return state.currentQuestion ? `${state.sessionId}:${stateVersion(state)}` : undefined;
}

function pendingCommand(state: InterviewState): AnswerCommand | undefined {
  const row = database.prepare(`
    SELECT command_id, question_id, expected_state_version, answer
    FROM answer_commands
    WHERE session_id = ? AND question_id = ? AND status = 'pending'
  `).get(state.sessionId, questionId(state) ?? "") as {
    command_id: string;
    question_id: string;
    expected_state_version: number;
    answer: string;
  } | undefined;
  return row ? {
    commandId: row.command_id,
    questionId: row.question_id,
    expectedStateVersion: row.expected_state_version,
    answer: row.answer,
  } : undefined;
}

function stateResponse(state: InterviewState, includePendingCommand = true): InterviewStateResponse {
  return {
    state,
    stateVersion: stateVersion(state),
    runtime: runtimeInfo,
    progress: getInterviewProgress(
      state,
      state.role.competencies.filter((competency) => competency.core).map((competency) => competency.id),
    ),
    questionId: questionId(state),
    pendingCommand: includePendingCommand ? pendingCommand(state) : undefined,
  };
}

function stepResponse(step: InterviewStep, commandId?: string): InterviewStepResponse {
  return {
    ...stateResponse(step.state, false),
    commandId,
    decision: step.decision,
    question: step.question,
    evidence: step.evidence,
  };
}

type CommandRow = {
  question_id: string;
  expected_state_version: number;
  answer: string;
  status: "pending" | "completed";
  response: string | null;
};

function assertCurrentCommand(state: InterviewState, command: AnswerCommand): void {
  if (!state.currentQuestion || command.questionId !== questionId(state)) {
    throw new HttpError(409, "STATE_CONFLICT", "Question is stale");
  }
  if (command.expectedStateVersion !== stateVersion(state)) {
    throw new HttpError(409, "STATE_CONFLICT", "State version is stale");
  }
}

function claimAnswerCommand(state: InterviewState, command: AnswerCommand): InterviewStepResponse | undefined {
  const existing = database.prepare(`
    SELECT question_id, expected_state_version, answer, status, response
    FROM answer_commands WHERE session_id = ? AND command_id = ?
  `).get(state.sessionId, command.commandId) as CommandRow | undefined;
  if (existing) {
    if (existing.question_id !== command.questionId
      || existing.expected_state_version !== command.expectedStateVersion
      || existing.answer !== command.answer) {
      throw new HttpError(409, "STATE_CONFLICT", "commandId was already used with different input");
    }
    if (existing.status === "completed" && existing.response) {
      const replay = JSON.parse(existing.response) as InterviewStepResponse;
      hydrateState(replay.state);
      return {
        ...replay,
        runtime: runtimeInfo,
        progress: getInterviewProgress(
          replay.state,
          replay.state.role.competencies.filter((competency) => competency.core).map((competency) => competency.id),
        ),
      };
    }
    assertCurrentCommand(state, command);
    const claimed = database.prepare(`
      UPDATE answer_commands SET lease_owner = ?, lease_expires_at = ?
      WHERE session_id = ? AND command_id = ? AND status = 'pending'
        AND (lease_owner IS NULL OR lease_expires_at <= ?)
    `).run(
      commandLeaseOwner,
      Date.now() + commandLeaseMs,
      state.sessionId,
      command.commandId,
      Date.now(),
    );
    if (Number(claimed.changes) !== 1) {
      throw new HttpError(409, "STATE_CONFLICT", "Answer command is already in progress", true);
    }
    return undefined;
  }

  assertCurrentCommand(state, command);
  try {
    database.prepare(`
      INSERT INTO answer_commands (
        session_id, command_id, question_id, expected_state_version, answer,
        status, lease_owner, lease_expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `).run(
      state.sessionId,
      command.commandId,
      command.questionId,
      command.expectedStateVersion,
      command.answer,
      commandLeaseOwner,
      Date.now() + commandLeaseMs,
      new Date().toISOString(),
    );
  } catch (error) {
    const competing = database.prepare(`
      SELECT command_id FROM answer_commands WHERE session_id = ? AND question_id = ?
    `).get(state.sessionId, command.questionId) as { command_id: string } | undefined;
    if (competing) {
      throw new HttpError(
        409,
        "STATE_CONFLICT",
        "Question already has an answer command in progress",
        competing.command_id === command.commandId,
      );
    }
    throw error;
  }
  return undefined;
}

function completeAnswerCommand(state: InterviewState, commandId: string, body: InterviewStepResponse): void {
  database.exec("BEGIN IMMEDIATE");
  try {
    const completed = database.prepare(`
      UPDATE answer_commands
      SET status = 'completed', response = ?, lease_owner = NULL, lease_expires_at = NULL
      WHERE session_id = ? AND command_id = ? AND status = 'pending' AND lease_owner = ?
    `).run(JSON.stringify(body), state.sessionId, commandId, commandLeaseOwner);
    if (Number(completed.changes) !== 1) {
      throw new HttpError(409, "STATE_CONFLICT", "Answer command lease was lost", true);
    }
    saveState(state);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function releaseAnswerCommand(state: InterviewState, commandId: string): void {
  database.prepare(`
    UPDATE answer_commands SET lease_owner = NULL, lease_expires_at = NULL
    WHERE session_id = ? AND command_id = ? AND status = 'pending' AND lease_owner = ?
  `).run(state.sessionId, commandId, commandLeaseOwner);
}

const demoTask = (): TaskExecutionTrace => ({ source: "demo", durationMs: 0, retryCount: 0 });

async function observeModelCall<T>(
  operation: (telemetry: TelemetryCollector) => Promise<T>,
  telemetry: TelemetryCollector,
): Promise<{ value: T; trace: TaskExecutionTrace }> {
  let retryCount = 0;
  const startedAt = performance.now();
  const priorAgentSpans = telemetry.trace.spans.filter((span) => span.kind === "agent").length;
  const value = await withOneProviderRetry(() => operation(telemetry), () => { retryCount += 1; });
  telemetry.trace.spans.filter((item) => item.kind === "agent").slice(priorAgentSpans)
    .forEach((span, attempt) => { span.retryCount = attempt; });
  return {
    value,
    trace: { source: "llm", durationMs: Math.round(performance.now() - startedAt), retryCount },
  };
}

function executionTrace(
  evidence?: TaskExecutionTrace,
  question?: TaskExecutionTrace,
): StepExecutionTrace {
  return {
    ...runtimeInfo,
    evidence,
    question,
  };
}

async function chooseNextStep(
  state: InterviewState,
  turnId?: string,
  commandId?: string,
  telemetry?: TelemetryCollector,
): Promise<{ step: InterviewStep; trace?: TaskExecutionTrace }> {
  if (state.turns.length >= HARD_MAX_TURNS) {
    return {
      step: applyInterviewDecision(state, {
        action: "FINISH_INTERVIEW",
        reason: "Hard turn limit reached.",
      }, turnId),
    };
  }
  if (interviewRuntime.mode === "demo") {
    return { step: applyInterviewDecision(state, getDemoInterviewDecision(state), turnId), trace: demoTask() };
  }
  if (!interviewRuntime.model || !interviewRuntime.streamFn) throw new Error("Interview LLM runtime is incomplete");
  const collector = telemetry ?? new TelemetryCollector({ sessionId: state.sessionId, commandId, turnId });
  const result = await observeModelCall(
    (current) => decideNextStepWithAgent({
      model: interviewRuntime.model!,
      streamFn: interviewRuntime.streamFn!,
      state,
      telemetry: current,
    }), collector,
  );
  return { step: applyInterviewDecision(state, result.value, turnId), trace: result.trace };
}

const server = createServer(async (request, response) => {
  try {
    const method = request.method ?? "GET";
    const pathname = new URL(request.url ?? "/", `http://${request.headers.host}`).pathname;

    if (method === "GET" && pathname === "/api/health") {
      return json(response, 200, { ok: true, runtime: runtimeInfo });
    }
    if (method === "POST" && pathname === "/api/interviews") {
      const body = await readJson(request);
      if (!Check(CreateInterviewBodySchema, body)) {
        throw new HttpError(400, "INVALID_REQUEST", "Create interview body is invalid");
      }
      const input = body as CreateInterviewBody;
      const intake = normalizeInterviewIntake(input);
      const role = buildInterviewRole({ job: intake.job });
      const id = randomUUID();
      const candidate = buildCandidateFromIntake(intake, role);
      const state = createInterviewState(id, role, candidate, intake);
      const now = new Date().toISOString();
      database
        .prepare("INSERT INTO sessions (id, state, created_at, updated_at) VALUES (?, ?, ?, ?)")
        .run(id, JSON.stringify(state), now, now);
      return json(response, 201, stateResponse(state));
    }

    const startMatch = pathname.match(/^\/api\/interviews\/([\w-]+)\/start$/);
    if (method === "POST" && startMatch) {
      const state = loadState(startMatch[1]);
      if (!state) throw new HttpError(404, "NOT_FOUND", "Interview not found");
      const telemetry = new TelemetryCollector({ sessionId: state.sessionId });
      try {
        observeStateChange(telemetry, "activate_interview", () => activateInterview(state));
        const { step, trace } = await chooseNextStep(state, undefined, undefined, telemetry);
        observeStateChange(telemetry, "persist_state", () => {
          setStepExecution(state, executionTrace(undefined, trace));
          saveState(state);
        });
        return json(response, 200, stepResponse(step));
      } finally {
        saveTelemetry(telemetry.trace);
      }
    }

    const answerMatch = pathname.match(/^\/api\/interviews\/([\w-]+)\/answer$/);
    if (method === "POST" && answerMatch) {
      const state = loadState(answerMatch[1]);
      if (!state) throw new HttpError(404, "NOT_FOUND", "Interview not found");
      const body = await readJson(request);
      if (!Check(AnswerCommandSchema, body) || !body.answer.trim()) {
        throw new HttpError(400, "INVALID_REQUEST", "Answer command is invalid");
      }
      const command: AnswerCommand = { ...body, answer: body.answer.trim() };
      const replay = claimAnswerCommand(state, command);
      if (replay) return json(response, 200, replay);
      const telemetry = new TelemetryCollector({ sessionId: state.sessionId, commandId: command.commandId });
      let completed = false;
      try {
        let edit: Awaited<ReturnType<typeof editReportWithAgent>> | undefined;
        let evidenceExecution: TaskExecutionTrace;
        if (reportRuntime.mode === "llm") {
          if (!reportRuntime.model || !reportRuntime.streamFn) throw new Error("Report LLM runtime is incomplete");
          const result = await observeModelCall((telemetry) => editReportWithAgent({
              model: reportRuntime.model!,
              streamFn: reportRuntime.streamFn!,
              state,
              answer: command.answer,
              telemetry,
            }), telemetry);
          edit = result.value;
          evidenceExecution = result.trace;
        } else {
          evidenceExecution = demoTask();
        }
        const record = observeStateChange(telemetry, "apply_report_edit", () =>
          recordAnswer(state, command.answer, edit?.evidence, edit?.answerDisposition));
        telemetry.trace.turnId = record.turn.id;
        for (const span of telemetry.trace.spans) span.turnId ??= record.turn.id;
        const { step, trace: questionExecution } = await chooseNextStep(
          state, record.turn.id, command.commandId, telemetry,
        );
        step.evidence = record.evidence;
        setStepExecution(state, executionTrace(evidenceExecution, questionExecution));
        const result = stepResponse(step, command.commandId);
        observeStateChange(telemetry, "persist_answer_command_and_state", () =>
          completeAnswerCommand(state, command.commandId, result));
        completed = true;
        return json(response, 200, result);
      } finally {
        if (!completed) releaseAnswerCommand(state, command.commandId);
        saveTelemetry(telemetry.trace);
      }
    }

    const stateMatch = pathname.match(/^\/api\/interviews\/([\w-]+)\/state$/);
    if (method === "GET" && stateMatch) {
      const state = loadState(stateMatch[1]);
      if (!state) throw new HttpError(404, "NOT_FOUND", "Interview not found");
      return json(response, 200, stateResponse(state));
    }
    const traceMatch = pathname.match(/^\/api\/interviews\/([\w-]+)\/traces$/);
    if (method === "GET" && traceMatch) {
      const rows = database.prepare(`
        SELECT trace FROM telemetry_traces WHERE session_id = ? ORDER BY created_at, trace_id
      `).all(traceMatch[1]) as Array<{ trace: string }>;
      return json(response, 200, rows.map((row) => JSON.parse(row.trace) as TelemetryTrace));
    }
    const traceIdMatch = pathname.match(/^\/api\/traces\/([\w-]+)$/);
    if (method === "GET" && traceIdMatch) {
      const row = database.prepare("SELECT trace FROM telemetry_traces WHERE trace_id = ?")
        .get(traceIdMatch[1]) as { trace: string } | undefined;
      if (!row) throw new HttpError(404, "NOT_FOUND", "Trace not found");
      return json(response, 200, JSON.parse(row.trace) as TelemetryTrace);
    }
    throw new HttpError(404, "NOT_FOUND", "Route not found");
  } catch (error) {
    if (error instanceof HttpError) return errorJson(response, error);
    if (error instanceof EvidenceValidationError) {
      return errorJson(response, new HttpError(422, "MODEL_OUTPUT_INVALID", error.message, true));
    }
    if (error instanceof ModelProviderError) {
      return errorJson(response, new HttpError(503, "PROVIDER_UNAVAILABLE", "Model provider is unavailable", true));
    }
    if (error instanceof SyntaxError) {
      return errorJson(response, new HttpError(400, "INVALID_REQUEST", "Request body is not valid JSON"));
    }
    if (error instanceof Error && /already started|not awaiting/.test(error.message)) {
      return errorJson(response, new HttpError(409, "STATE_CONFLICT", error.message));
    }
    return errorJson(response, new HttpError(500, "INTERNAL_ERROR", "Internal server error", true));
  }
});

server.listen(port, "127.0.0.1", () => {
  const runtimeLabel = defaultRuntime.mode === "llm"
    ? `${defaultRuntime.provider}/report=${agentModelIds!.reportModelId},interview=${agentModelIds!.interviewModelId}`
    : "demo";
  console.log(`Better Resume API: http://127.0.0.1:${port} (${runtimeLabel})`);
});
