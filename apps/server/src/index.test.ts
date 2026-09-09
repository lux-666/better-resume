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
        LLM_PROVIDER: "",
        LLM_MODEL: "",
        GENE_AGENT_LLM_PROVIDER: "",
        GENE_AGENT_LLM_MODEL: "",
        PI_PROVIDER: "",
        PI_MODEL: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    apiProcess.stderr.on("data", (chunk) => { stderr += chunk; });
    await new Promise<void>((resolveReady, reject) => {
      apiProcess.stdout.once("data", () => resolveReady());
      apiProcess.once("exit", (code) => reject(new Error(`API exited before startup: ${code}\n${stderr}`)));
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
  const oversizedSkills = await post("/api/interviews", {
    candidate: { name: "测试", skills: Array.from({ length: 53 }, (_, index) => `技能${index}`), projects: [{ name: "项目", description: "开发经历" }] },
  });
  assert.equal(oversizedSkills.response.status, 400);
  assert.equal(oversizedSkills.body.code, "INVALID_REQUEST");
  assert.match(oversizedSkills.body.message, /技能最多 50 项/);
  assert.deepEqual((await get("/api/interviews")).body, { sessions: [] });
  const created = await post("/api/interviews", {
    candidate: {
      name: "Contract",
      skills: [],
      projects: [{
        name: "通用项目",
        description: "负责项目设计、实现和上线。",
      }],
    },
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.stateVersion, 0);
  assert.deepEqual(created.body.runtime, { mode: "demo" });
  assert.equal(created.body.progress.coveragePercent, 0);
  const sessionId = created.body.state.sessionId as string;

  const custom = await post("/api/interviews", {
    candidate: {
      name: "林青",
      skills: ["Go", "PostgreSQL"],
      projects: [
        {
          name: "订单服务改造",
          description: "作为核心开发负责交易系统开发和上线，延迟降低 35%。",
        },
        {
          name: "风控平台",
          description: "建设实时规则引擎。",
        },
      ],
    },
    job: {
      title: "支付平台工程师",
      introduction: "负责支付平台核心系统。",
      responsibilities: "设计高并发支付系统。",
      requirements: "熟悉 Go。",
    },
  });
  assert.equal(custom.response.status, 201);
  assert.equal(custom.body.state.role.name, "支付平台工程师");
  assert.equal(custom.body.state.role.source, "job_description");
  assert.equal(custom.body.state.candidate.name, "林青");
  assert.equal(custom.body.state.candidate.projects.length, 2);
  assert.deepEqual(Object.keys(custom.body.state.intake.candidate.projects[0]).sort(), ["description", "name"]);
  assert.equal("resume" in custom.body.state.intake, false);
  assert.equal(JSON.stringify(custom.body).includes("project_enterprise_rag"), false);

  const started = await post(`/api/interviews/${sessionId}/start`, {});
  assert.equal(started.body.stateVersion, 1);
  assert.equal(started.body.state.traces[0].execution.question.source, "demo");
  const traces = await get(`/api/interviews/${sessionId}/traces`);
  assert.equal(traces.response.status, 200);
  assert.equal(Array.isArray(traces.body), true);
  assert.deepEqual((traces.body as any[]).map((t) => t.operation), ["create", "start"]);
  assert.ok((traces.body as any[]).find((t) => t.operation === "start").spans.some((span: { operation: string }) => span.operation === "persist_state"));
  const command = {
    commandId: "command-1",
    questionId: started.body.questionId,
    expectedStateVersion: started.body.stateVersion,
    answer: "我负责召回模块的设计和实现，并完成了切分策略、接口联调和线上验证。",
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
  assert.equal(first.body.state.traces.at(-1).execution.evidence.source, "demo");
  assert.equal(first.body.progress.projects.covered, 1);

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

  let current = recovered.body;
  for (let index = 0; current.state.status === "active" && index < 14; index += 1) {
    const targetFieldId = current.state.traces.at(-1).targetFieldId as string;
    const answer = current.state.openFloor ? "没有了" : targetFieldId.endsWith(":measurement")
      ? "指标按固定测试集上的成功比例计算，并与同一批样本的历史基线对照。"
      : targetFieldId.endsWith(":failure")
        ? "我通过日志定位根因，修复后补了回归验证和告警。"
        : "我负责这部分的具体设计、实现、上线验证和回归检查。";
    const next = await post(`/api/interviews/${sessionId}/answer`, {
      commandId: `long-command-${index}`,
      questionId: current.questionId,
      expectedStateVersion: current.stateVersion,
      answer,
    });
    assert.equal(next.response.status, 200);
    current = next.body;
  }
  assert.equal(current.state.status, "completed");
  assert.ok(current.state.turns.length >= 4 && current.state.turns.length <= 15);
  assert.equal(new Set(current.state.turns.map((turn: { question: string }) => turn.question)).size,
    current.state.turns.length);
  assert.equal(current.state.report.status, "complete");
  assert.ok(current.state.candidate.projects.flatMap((project: { claims: Array<{ status: string }> }) => project.claims)
    .every((claim: { status: string }) => claim.status === "supported"));
  const report = await get(`/api/interviews/${sessionId}/report`);
  assert.equal(report.response.status, 200);
  assert.equal(report.body.report.status, "complete");
  assert.equal(report.body.report.integrity.valid, true);
  assert.equal(report.body.report.executiveSummary.recommendation, "continue_process");
  assert.equal("scorecard" in report.body, false);
  assert.match(report.body.markdown, /# 候选人评估报告/);
  assert.match(report.body.markdown, /## 招聘方下一步建议/);
});
