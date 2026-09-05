import { resolve } from "node:path";
import { createApplication } from "./application.ts";
const port = Number(process.env.PORT ?? 3000);
const leaseMs = Number(process.env.COMMAND_LEASE_MS ?? 120_000);
if (!Number.isFinite(leaseMs) || leaseMs <= 0) throw new Error("COMMAND_LEASE_MS must be positive");
const app = createApplication({ databasePath: resolve(process.env.DATABASE_PATH ?? "data/better-resume.db"), leaseMs,
  deadlineMs: process.env.COMMAND_DEADLINE_MS ? Number(process.env.COMMAND_DEADLINE_MS) : undefined });
app.server.listen(port, "127.0.0.1", () => {
  const runtime = app.execution.runtimes.info;
  console.log(`Better Resume API: http://127.0.0.1:${port} (${runtime.mode})`);
});
