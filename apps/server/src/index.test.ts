import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import test from "node:test";

test("Answer API is idempotent and rejects stale questions", async (t) => {
  const root = resolve(import.meta.dirname, "../../..");
  const directory = mkdtempSync(join(tmpdir(), "better-resume-http-"));
  const port = 32_000 + process.pid % 1_000;
  const child = spawn(process.execPath, ["--import", "tsx", "apps/server/src/index.ts"], {
    cwd: root,
    env: {
      ...process.env,
      DATABASE_PATH: join(directory, "session.db"),
      PORT: String(port),
      PI_PROVIDER: "",
      PI_MODEL: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    child.kill();
    if (child.exitCode === null) await once(child, "exit");
    rmSync(directory, { recursive: true, force: true });
  });
  await new Promise<void>((resolveReady, reject) => {
    child.stdout.once("data", () => resolveReady());
    child.once("exit", (code) => reject(new Error(`API exited before startup: ${code}`)));
  });

  const post = async (path: string, body: unknown) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
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
  const first = await post(`/api/interviews/${sessionId}/answer`, command);
  const replay = await post(`/api/interviews/${sessionId}/answer`, command);
  assert.equal(first.response.status, 200);
  assert.deepEqual(replay.body, first.body);
  assert.equal(first.body.state.turns.length, 1);

  const stale = await post(`/api/interviews/${sessionId}/answer`, {
    ...command,
    commandId: "command-2",
  });
  assert.equal(stale.response.status, 409);
  assert.equal(stale.body.code, "STATE_CONFLICT");
});
