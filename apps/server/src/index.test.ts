import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

test("Answer API survives process recovery, leases commands, and rejects stale questions", async (t) => {
  const root = resolve(import.meta.dirname, "../../..");
  const directory = mkdtempSync(join(tmpdir(), "better-resume-http-"));
  const databasePath = join(directory, "session.db");
  const port = 32_000 + process.pid % 1_000;
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE answer_commands (
      session_id TEXT NOT NULL,
      command_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      expected_state_version INTEGER NOT NULL,
      answer TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'completed')),
      response TEXT,
      created_at TEXT NOT NULL,
      PRIMARY KEY (session_id, command_id),
      UNIQUE (session_id, question_id)
    )
  `);
  legacy.close();
  const launch = async () => {
    const apiProcess = spawn(process.execPath, ["--import", "tsx", "apps/server/src/index.ts"], {
      cwd: root,
      env: {
        ...process.env,
        DATABASE_PATH: databasePath,
        PORT: String(port),
        PI_PROVIDER: "",
        PI_MODEL: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    await new Promise<void>((resolveReady, reject) => {
      apiProcess.stdout.once("data", () => resolveReady());
      apiProcess.once("exit", (code) => reject(new Error(`API exited before startup: ${code}`)));
    });
    return apiProcess;
  };
  let child = await launch();
  const stop = async () => {
    if (child.exitCode !== null) return;
    const exited = once(child, "exit");
    child.kill();
    await exited;
  };
  t.after(async () => {
    await stop();
    rmSync(directory, { recursive: true, force: true });
  });

  const post = async (path: string, body: unknown) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { response, body: await response.json() as Record<string, any> };
  };
  const get = async (path: string) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    return { response, body: await response.json() as Record<string, any> };
  };
  const created = await post("/api/interviews", { candidateName: "Contract" });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.stateVersion, 0);
  const sessionId = created.body.state.sessionId as string;

  const started = await post(`/api/interviews/${sessionId}/start`, {});
  assert.equal(started.body.stateVersion, 1);
  const command = {
    commandId: "command-1",
    questionId: started.body.questionId,
    expectedStateVersion: started.body.stateVersion,
    answer: "我负责召回模块的设计和实现，并完成了线上验证。",
  };
  const competing = new DatabaseSync(databasePath);
  competing.prepare(`
    INSERT INTO answer_commands (
      session_id, command_id, question_id, expected_state_version, answer,
      status, lease_owner, lease_expires_at, created_at
    ) VALUES (?, ?, ?, ?, ?, 'pending', 'other-process', ?, ?)
  `).run(
    sessionId,
    command.commandId,
    command.questionId,
    command.expectedStateVersion,
    command.answer,
    Date.now() + 60_000,
    new Date().toISOString(),
  );
  competing.close();
  const blocked = await post(`/api/interviews/${sessionId}/answer`, command);
  assert.equal(blocked.response.status, 409);
  assert.equal(blocked.body.retryable, true);
  const competingCommand = await post(`/api/interviews/${sessionId}/answer`, {
    ...command,
    commandId: "command-2",
  });
  assert.equal(competingCommand.response.status, 409);
  assert.equal(competingCommand.body.retryable, false);
  const pending = await get(`/api/interviews/${sessionId}/state`);
  assert.deepEqual(pending.body.pendingCommand, command);
  assert.equal(pending.body.state.turns.length, 0);
  const expired = new DatabaseSync(databasePath);
  expired.prepare(`
    UPDATE answer_commands SET lease_expires_at = 0 WHERE session_id = ? AND command_id = ?
  `).run(sessionId, command.commandId);
  expired.close();

  const first = await post(`/api/interviews/${sessionId}/answer`, command);
  assert.equal(first.response.status, 200);
  assert.equal(first.body.pendingCommand, undefined);
  assert.equal(first.body.state.turns.length, 1);

  await stop();
  child = await launch();
  const recovered = await get(`/api/interviews/${sessionId}/state`);
  assert.equal(recovered.response.status, 200);
  assert.equal(recovered.body.stateVersion, first.body.stateVersion);
  assert.equal(recovered.body.state.turns.length, 1);
  const replay = await post(`/api/interviews/${sessionId}/answer`, command);
  assert.deepEqual(replay.body, first.body);

  const stale = await post(`/api/interviews/${sessionId}/answer`, {
    ...command,
    commandId: "command-3",
  });
  assert.equal(stale.response.status, 409);
  assert.equal(stale.body.code, "STATE_CONFLICT");
});
