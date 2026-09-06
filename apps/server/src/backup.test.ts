import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { InterviewStore } from "./store.ts";
import { backupDatabase } from "./backup.ts";
import { createFixtureCandidate, createInterviewState } from "../../../packages/interview-core/src/index.ts";
test("online SQLite backup includes WAL commits, restores history, and never overwrites a backup", async () => {
  const root = mkdtempSync(join(tmpdir(), "phase4-backup-")); const source = join(root, "source.db"); const target = join(root, "copy.db");
  const store = new InterviewStore(source);
  try {
    const state = createInterviewState("backup", "role", createFixtureCandidate()); store.create(state);
    await backupDatabase(source, target);
    const restored = new InterviewStore(target);
    try { assert.deepEqual(restored.load(state.sessionId), store.load(state.sessionId)); assert.equal(restored.history().length, 1); }
    finally { restored.close(); }
    await assert.rejects(backupDatabase(source, target), /EEXIST/);
    await assert.rejects(backupDatabase(source, source), /different path/);
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});
