import { backup, DatabaseSync } from "node:sqlite";
import { closeSync, mkdirSync, openSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
export async function backupDatabase(source: string, destination: string): Promise<void> {
  if (resolve(source) === resolve(destination)) throw new Error("Backup must use a different path");
  mkdirSync(dirname(resolve(destination)), { recursive: true });
  // Reserve the destination exclusively so an existing backup is never overwritten.
  closeSync(openSync(destination, "wx"));
  let database: DatabaseSync | undefined;
  try {
    database = new DatabaseSync(source, { readOnly: true });
    await backup(database, destination);
    const copied = new DatabaseSync(destination, { readOnly: true });
    try { if (copied.prepare("PRAGMA integrity_check").get()?.integrity_check !== "ok") throw new Error("Backup integrity check failed"); }
    finally { copied.close(); }
  } catch (error) { rmSync(destination, { force: true }); throw error; }
  finally { database?.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const destination = process.argv[2];
  if (!destination) throw new Error("Usage: npm run backup -- /path/to/new-backup.db");
  await backupDatabase(resolve(process.env.DATABASE_PATH ?? "data/better-resume.db"), resolve(destination));
  console.log(`Verified SQLite backup: ${resolve(destination)}`);
}
