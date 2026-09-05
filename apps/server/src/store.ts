import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AnswerCommand, InterviewStepResponse } from "../../../packages/api-contract/src/index.ts";
import type { InterviewState } from "../../../packages/interview-core/src/index.ts";
import type { TelemetryTrace } from "../../../packages/api-contract/src/telemetry.ts";
import { hydrateState, questionId, stateVersion } from "./session.ts";
import { HttpError } from "./http.ts";
type CommandRow = { intent: string; question_id: string; expected_state_version: number; answer: string; status: string; response: string | null };
const commandTable = (name: string) => `CREATE TABLE ${name}(session_id TEXT NOT NULL, command_id TEXT NOT NULL, question_id TEXT NOT NULL,
  expected_state_version INTEGER NOT NULL, answer TEXT NOT NULL, intent TEXT NOT NULL DEFAULT 'answer',
  status TEXT NOT NULL CHECK(status IN ('pending','completed','rejected')), response TEXT, lease_owner TEXT, lease_expires_at INTEGER,
  created_at TEXT NOT NULL, PRIMARY KEY(session_id,command_id))`;
export class InterviewStore {
  readonly database: DatabaseSync;
  constructor(path: string, readonly leaseMs = 120_000) {
    mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, state TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      ${commandTable("IF NOT EXISTS answer_commands")};
      CREATE TABLE IF NOT EXISTS telemetry_traces(trace_id TEXT PRIMARY KEY, session_id TEXT, command_id TEXT, turn_id TEXT, trace TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS traces_session_created ON telemetry_traces(session_id,created_at);
      CREATE TABLE IF NOT EXISTS report_narratives(session_id TEXT PRIMARY KEY, state_version INTEGER NOT NULL, status TEXT NOT NULL, result TEXT, trace_id TEXT);
    `);
    for (const [name, type] of [["lease_owner", "TEXT"], ["lease_expires_at", "INTEGER"], ["intent", "TEXT NOT NULL DEFAULT 'answer'"]]) {
      const columns = this.database.prepare("PRAGMA table_info(answer_commands)").all() as Array<{ name: string }>;
      if (!columns.some((column) => column.name === name)) this.database.exec(`ALTER TABLE answer_commands ADD COLUMN ${name} ${type}`);
    }
    const definition = this.database.prepare("SELECT sql FROM sqlite_master WHERE name='answer_commands'").get() as { sql: string };
    if (!definition.sql.includes("'rejected'")) {
      this.database.exec("BEGIN IMMEDIATE");
      try {
        this.database.exec(`${commandTable("answer_commands_next")};
          INSERT INTO answer_commands_next SELECT session_id,command_id,question_id,expected_state_version,answer,intent,status,response,lease_owner,lease_expires_at,created_at FROM answer_commands;
          DROP TABLE answer_commands; ALTER TABLE answer_commands_next RENAME TO answer_commands; COMMIT;`);
      } catch (error) { this.database.exec("ROLLBACK"); throw error; }
    }
    this.database.exec("CREATE UNIQUE INDEX IF NOT EXISTS one_accepted_answer_per_question ON answer_commands(session_id,question_id) WHERE status!='rejected'");
  }
  load(id: string): InterviewState | undefined {
    const row = this.database.prepare("SELECT state FROM sessions WHERE id=?").get(id) as { state: string } | undefined;
    return row ? hydrateState(JSON.parse(row.state)) : undefined;
  }
  create(state: InterviewState): void {
    const now = new Date().toISOString();
    this.database.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(state.sessionId, JSON.stringify(state), now, now);
  }
  save(state: InterviewState, expectedVersion: number): void {
    const saved = this.database.prepare("UPDATE sessions SET state=?,updated_at=? WHERE id=? AND json_array_length(state,'$.traces')=?")
      .run(JSON.stringify(state), new Date().toISOString(), state.sessionId, expectedVersion);
    if (Number(saved.changes) !== 1) throw new HttpError(409, "STATE_CONFLICT", "State version changed", true);
  }
  pending(state: InterviewState): AnswerCommand | undefined {
    const row = this.database.prepare(`SELECT command_id,question_id,expected_state_version,answer,intent FROM answer_commands
      WHERE session_id=? AND question_id=? AND status='pending'`).get(state.sessionId, questionId(state) ?? "") as
      { command_id: string; question_id: string; expected_state_version: number; answer: string; intent: AnswerCommand["intent"] } | undefined;
    return row ? { commandId: row.command_id, questionId: row.question_id, expectedStateVersion: row.expected_state_version, answer: row.answer, ...(row.intent !== "answer" ? { intent: row.intent } : {}) } : undefined;
  }
  pendingSupplement(state: InterviewState): (AnswerCommand & { projectId: string }) | undefined {
    const row = this.database.prepare("SELECT command_id,question_id,expected_state_version,answer FROM answer_commands WHERE session_id=? AND question_id LIKE ? AND status='pending'")
      .get(state.sessionId, `${state.sessionId}:supplement:%`) as { command_id: string; question_id: string; expected_state_version: number; answer: string } | undefined;
    return row ? { commandId: row.command_id, questionId: row.question_id, expectedStateVersion: row.expected_state_version, answer: row.answer,
      projectId: row.question_id.slice(`${state.sessionId}:supplement:`.length) } : undefined;
  }
  claim(state: InterviewState, command: AnswerCommand, validate?: () => void): { owner: string; replay?: InterviewStepResponse } {
    const existing = this.database.prepare("SELECT question_id,expected_state_version,answer,status,response,intent FROM answer_commands WHERE session_id=? AND command_id=?")
      .get(state.sessionId, command.commandId) as CommandRow | undefined;
    if (existing && (existing.question_id !== command.questionId || existing.expected_state_version !== command.expectedStateVersion || existing.answer !== command.answer || existing.intent !== (command.intent ?? "answer"))) {
      throw new HttpError(409, "STATE_CONFLICT", "commandId was already used with different input");
    }
    if (existing?.status === "completed" && existing.response) return { owner: "", replay: JSON.parse(existing.response) };
    if (existing?.status === "rejected" && existing.response) {
      const failure = JSON.parse(existing.response) as { status: number; code: HttpError["code"]; message: string };
      throw new HttpError(failure.status, failure.code, failure.message, false);
    }
    if (validate) validate();
    else if (!state.currentQuestion || command.questionId !== questionId(state) || command.expectedStateVersion !== stateVersion(state)) {
      throw new HttpError(409, "STATE_CONFLICT", "Question or state version is stale");
    }
    const owner = randomUUID();
    if (existing) {
      const claimed = this.database.prepare(`UPDATE answer_commands SET lease_owner=?,lease_expires_at=?
        WHERE session_id=? AND command_id=? AND status='pending' AND (lease_owner IS NULL OR lease_expires_at<=?)`)
        .run(owner, Date.now() + this.leaseMs, state.sessionId, command.commandId, Date.now());
      if (Number(claimed.changes) !== 1) throw new HttpError(409, "STATE_CONFLICT", "Answer command is already in progress", true);
    } else {
      try {
        this.database.prepare(`INSERT INTO answer_commands(session_id,command_id,question_id,expected_state_version,answer,intent,status,lease_owner,lease_expires_at,created_at)
          VALUES(?,?,?,?,?,?,'pending',?,?,?)`).run(state.sessionId, command.commandId, command.questionId, command.expectedStateVersion, command.answer, command.intent ?? "answer",
          owner, Date.now() + this.leaseMs, new Date().toISOString());
      } catch (error) {
        const competing = this.database.prepare("SELECT command_id FROM answer_commands WHERE session_id=? AND question_id=? AND status!='rejected'")
          .get(state.sessionId, command.questionId) as { command_id: string } | undefined;
        if (competing) throw new HttpError(409, "STATE_CONFLICT", "Question already has an answer command in progress", competing.command_id === command.commandId);
        throw error;
      }
    }
    return { owner };
  }
  complete(state: InterviewState, command: AnswerCommand, owner: string, body: InterviewStepResponse): void {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const done = this.database.prepare(`UPDATE answer_commands SET status='completed',response=?,lease_owner=NULL,lease_expires_at=NULL
        WHERE session_id=? AND command_id=? AND status='pending' AND lease_owner=? AND lease_expires_at>?`)
        .run(JSON.stringify(body), state.sessionId, command.commandId, owner, Date.now());
      if (Number(done.changes) !== 1) throw new HttpError(409, "STATE_CONFLICT", "Answer command lease was lost", true);
      this.save(state, command.expectedStateVersion);
      this.database.exec("COMMIT");
    } catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }
  release(sessionId: string, commandId: string, owner: string): void {
    this.database.prepare("UPDATE answer_commands SET lease_owner=NULL,lease_expires_at=NULL WHERE session_id=? AND command_id=? AND status='pending' AND lease_owner=?")
      .run(sessionId, commandId, owner);
  }
  reject(sessionId: string, commandId: string, owner: string, failure: HttpError): void {
    // Terminal input rejections retain the original payload for replay but free the question for a valid answer.
    const result = this.database.prepare(`UPDATE answer_commands SET status='rejected',response=?,lease_owner=NULL,lease_expires_at=NULL
      WHERE session_id=? AND command_id=? AND status='pending' AND lease_owner=? AND lease_expires_at>?`)
      .run(JSON.stringify({ status: failure.status, code: failure.code, message: failure.message }), sessionId, commandId, owner, Date.now());
    if (Number(result.changes) !== 1) throw new HttpError(409, "STATE_CONFLICT", "Answer command lease was lost", true);
  }
  saveTrace(trace: TelemetryTrace): void {
    this.database.prepare("INSERT OR REPLACE INTO telemetry_traces VALUES(?,?,?,?,?,?)")
      .run(trace.traceId, trace.sessionId ?? null, trace.commandId ?? null, trace.turnId ?? null, JSON.stringify(trace), trace.startedAt);
  }
  traces(sessionId: string): TelemetryTrace[] {
    const rows = this.database.prepare("SELECT trace FROM telemetry_traces WHERE session_id=? ORDER BY created_at,trace_id").all(sessionId) as Array<{ trace: string }>;
    return rows.map((row) => JSON.parse(row.trace));
  }
  trace(traceId: string): TelemetryTrace | undefined {
    const row = this.database.prepare("SELECT trace FROM telemetry_traces WHERE trace_id=?").get(traceId) as { trace: string } | undefined;
    return row && JSON.parse(row.trace);
  }
  recoverTelemetry(): void {
    // This application owns one process per database. Running snapshots left by the previous process are interrupted.
    const rows = this.database.prepare("SELECT trace FROM telemetry_traces WHERE json_extract(trace,'$.status')='running'").all() as Array<{ trace: string }>;
    for (const row of rows) {
      const trace = JSON.parse(row.trace) as TelemetryTrace;
      trace.status = "interrupted"; trace.endedAt = new Date().toISOString(); trace.revision = (trace.revision ?? 0) + 1;
      for (const span of trace.spans) if (span.status === "running") span.status = "interrupted";
      this.saveTrace(trace);
    }
    this.database.prepare("UPDATE answer_commands SET lease_owner=NULL,lease_expires_at=NULL WHERE status='pending'").run();
    this.database.prepare("UPDATE report_narratives SET status='failed' WHERE status='pending'").run();
  }
  close(): void { this.database.close(); }
}
