import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  createInterviewState,
  type CandidateProfile,
  type InterviewState,
} from "../../../packages/interview-core/src/index.ts";

const port = Number(process.env.PORT ?? 3000);
const databasePath = resolve(process.env.DATABASE_PATH ?? "data/better-resume.db");
mkdirSync(dirname(databasePath), { recursive: true });

const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

const role = JSON.parse(
  readFileSync(resolve("roles/llm_engineer/role.json"), "utf8"),
) as unknown;

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error("Request body is too large");
  }
  if (!body) return {};
  const value: unknown = JSON.parse(body);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("JSON body must be an object");
  }
  return value as Record<string, unknown>;
}

function loadState(id: string): InterviewState | undefined {
  const row = database.prepare("SELECT state FROM sessions WHERE id = ?").get(id) as
    | { state: string }
    | undefined;
  return row ? (JSON.parse(row.state) as InterviewState) : undefined;
}

const server = createServer(async (request, response) => {
  try {
    const method = request.method ?? "GET";
    const pathname = new URL(request.url ?? "/", `http://${request.headers.host}`).pathname;

    if (method === "GET" && pathname === "/api/health") {
      return json(response, 200, { ok: true });
    }
    if (method === "GET" && pathname === "/api/roles") {
      return json(response, 200, [role]);
    }
    if (method === "POST" && pathname === "/api/interviews") {
      const body = await readJson(request);
      const candidateName = body.candidateName;
      if (candidateName !== undefined && (typeof candidateName !== "string" || candidateName.length > 100)) {
        return json(response, 400, { error: "candidateName must be a string up to 100 characters" });
      }

      const id = randomUUID();
      const candidate: CandidateProfile = {
        id: randomUUID(),
        name: typeof candidateName === "string" && candidateName.trim() ? candidateName.trim() : "匿名候选人",
        education: [],
        experiences: [],
        projects: [],
        skills: [],
        claims: [],
      };
      const state = createInterviewState(id, "llm_application_engineer", candidate);
      const now = new Date().toISOString();
      database
        .prepare("INSERT INTO sessions (id, state, created_at, updated_at) VALUES (?, ?, ?, ?)")
        .run(id, JSON.stringify(state), now, now);
      return json(response, 201, state);
    }

    const stateMatch = pathname.match(/^\/api\/interviews\/([\w-]+)\/state$/);
    if (method === "GET" && stateMatch) {
      const state = loadState(stateMatch[1]);
      return state ? json(response, 200, state) : json(response, 404, { error: "Interview not found" });
    }
    return json(response, 404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return json(response, 400, { error: message });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Better Resume API: http://127.0.0.1:${port}`);
});
