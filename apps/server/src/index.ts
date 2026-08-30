import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import {
  createFixtureCandidate,
  createInterviewState,
  startInterview,
  submitAnswer,
  type InterviewState,
} from "../../../packages/interview-core/src/index.ts";
import { extractEvidenceWithAgent } from "../../../packages/pi-runtime/src/index.ts";

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
const piProvider = process.env.PI_PROVIDER;
const piModelId = process.env.PI_MODEL;
if (Boolean(piProvider) !== Boolean(piModelId)) throw new Error("PI_PROVIDER and PI_MODEL must be set together");
const models = piProvider ? builtinModels() : undefined;
const model = piProvider && piModelId ? models?.getModel(piProvider, piModelId) : undefined;
if (piProvider && !model) throw new Error(`Unknown Pi model: ${piProvider}/${piModelId}`);

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

function saveState(state: InterviewState): void {
  database
    .prepare("UPDATE sessions SET state = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(state), new Date().toISOString(), state.sessionId);
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
      const candidate = createFixtureCandidate(
        typeof candidateName === "string" && candidateName.trim() ? candidateName.trim() : "匿名候选人",
      );
      const state = createInterviewState(id, "llm_application_engineer", candidate);
      const now = new Date().toISOString();
      database
        .prepare("INSERT INTO sessions (id, state, created_at, updated_at) VALUES (?, ?, ?, ?)")
        .run(id, JSON.stringify(state), now, now);
      return json(response, 201, state);
    }

    const startMatch = pathname.match(/^\/api\/interviews\/([\w-]+)\/start$/);
    if (method === "POST" && startMatch) {
      const state = loadState(startMatch[1]);
      if (!state) return json(response, 404, { error: "Interview not found" });
      const step = startInterview(state);
      saveState(state);
      return json(response, 200, step);
    }

    const answerMatch = pathname.match(/^\/api\/interviews\/([\w-]+)\/answer$/);
    if (method === "POST" && answerMatch) {
      const state = loadState(answerMatch[1]);
      if (!state) return json(response, 404, { error: "Interview not found" });
      const body = await readJson(request);
      if (typeof body.answer !== "string" || !body.answer.trim() || body.answer.length > 10_000) {
        return json(response, 400, { error: "answer must be a non-empty string up to 10000 characters" });
      }
      const answer = body.answer.trim();
      const extraction = model && models
        ? await extractEvidenceWithAgent({
            model,
            streamFn: models.streamSimple.bind(models),
            state,
            answer,
          })
        : undefined;
      const step = submitAnswer(state, answer, extraction?.evidence);
      saveState(state);
      return json(response, 200, step);
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
