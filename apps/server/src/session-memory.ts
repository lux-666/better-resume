import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { InterviewState } from "../../../packages/interview-core/src/types.ts";
import type { RecallHit, RecallQuery, SessionRecall } from "../../../packages/pi-runtime/src/recall.ts";
import type { TelemetryCollector } from "../../../packages/pi-runtime/src/telemetry.ts";
import type { EmbeddingClient } from "./embedding.ts";
import { cosine } from "./knowledge-store.ts";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
type Chunk = Omit<RecallHit, "score">;
export class SessionMemory implements SessionRecall {
  constructor(readonly database: DatabaseSync, readonly client?: EmbeddingClient) {
    database.exec(`CREATE TABLE IF NOT EXISTS session_chunks(session_id TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL,
      content_hash TEXT NOT NULL, fingerprint TEXT NOT NULL, embedding TEXT NOT NULL, PRIMARY KEY(session_id,kind,id));
      CREATE TABLE IF NOT EXISTS session_documents(session_id TEXT PRIMARY KEY, revision TEXT NOT NULL, chunks TEXT NOT NULL);`);
  }
  private document(id: string): { revision: string; chunks: string } | undefined {
    return this.database.prepare("SELECT revision,chunks FROM session_documents WHERE session_id=?").get(id) as { revision: string; chunks: string } | undefined;
  }
  resumeInfo(sessionId: string) {
    const doc = this.document(sessionId); const chunks: Chunk[] = doc ? JSON.parse(doc.chunks) : [];
    const rows = this.database.prepare("SELECT id,content_hash,fingerprint FROM session_chunks WHERE session_id=? AND kind='resume'").all(sessionId) as Array<{ id: string; content_hash: string; fingerprint: string }>;
    return { resumeIndexed: chunks.length > 0 && chunks.every((c) => rows.some((r) => r.id === c.id && r.content_hash === hash(c.text) && (!this.client || r.fingerprint === this.client.fingerprint))), chunkCount: chunks.length };
  }
  async saveResume(sessionId: string, text: string, telemetry?: TelemetryCollector, signal?: AbortSignal): Promise<void> {
    const chunks: Chunk[] = [];
    const normalized = text.replace(/\r\n?/g, "\n").trim();
    if (!normalized || normalized.length > 100_000) throw new Error("Resume size is invalid");
    for (let offset = 0; offset < normalized.length; offset += 1000) chunks.push({ kind: "resume", id: `resume:${offset / 1000}`, text: normalized.slice(offset, offset + 1100) });
    this.database.prepare("INSERT OR REPLACE INTO session_documents VALUES(?,?,?)").run(sessionId, hash(normalized), JSON.stringify(chunks));
    try { await this.index(sessionId, chunks, telemetry, signal); }
    catch (error) { this.deleteResume(sessionId); throw error; }
  }
  deleteResume(sessionId: string): void {
    this.database.prepare("DELETE FROM session_documents WHERE session_id=?").run(sessionId);
    this.database.prepare("DELETE FROM session_chunks WHERE session_id=? AND kind='resume'").run(sessionId);
  }
  private async index(sessionId: string, chunks: Chunk[], telemetry?: TelemetryCollector, signal?: AbortSignal) {
    if (!this.client) throw new Error("Memory embedding is not configured");
    const span = telemetry?.start("session_index", "embedding", undefined, { model: this.client.model });
    try {
      const rows = this.database.prepare("SELECT kind,id,content_hash,fingerprint,embedding FROM session_chunks WHERE session_id=?").all(sessionId) as Array<{ kind: string; id: string; content_hash: string; fingerprint: string; embedding: string }>;
      const old = new Map(rows.map((row) => [`${row.kind}:${row.id}`, row]));
      const vectors = new Map<string, number[]>();
      for (let i = 0; i < chunks.length; i += 10) {
        const batch = chunks.slice(i, i + 10);
        const pending = batch.filter((c) => old.get(`${c.kind}:${c.id}`)?.content_hash !== hash(c.text) || old.get(`${c.kind}:${c.id}`)?.fingerprint !== this.client!.fingerprint);
        const fresh = pending.length ? await this.client.embed(pending.map((c) => c.text), signal) : [];
        pending.forEach((c, n) => vectors.set(`${c.kind}:${c.id}`, fresh[n]));
        for (const c of batch) if (!vectors.has(`${c.kind}:${c.id}`)) vectors.set(`${c.kind}:${c.id}`, JSON.parse(old.get(`${c.kind}:${c.id}`)!.embedding));
      }
      signal?.throwIfAborted();
      // A deleted session/document must not be resurrected by an embedding response arriving late.
      if (!this.database.prepare("SELECT id FROM sessions WHERE id=?").get(sessionId)) throw new Error("Session was deleted");
      if (chunks.some((c) => c.kind === "resume") && !this.document(sessionId)) throw new Error("Resume was deleted");
      this.database.exec("BEGIN IMMEDIATE");
      try {
        const insert = this.database.prepare("INSERT OR REPLACE INTO session_chunks VALUES(?,?,?,?,?,?)");
        for (const c of chunks) insert.run(sessionId, c.kind, c.id, hash(c.text), this.client.fingerprint, JSON.stringify(vectors.get(`${c.kind}:${c.id}`)));
        this.database.exec("COMMIT");
      } catch (error) { this.database.exec("ROLLBACK"); throw error; }
      if (span) telemetry!.finish(span); return vectors;
    } catch (error) { if (span) { telemetry!.error(span, "api_error", error); telemetry!.finish(span); } throw error; }
  }
  async recall(state: InterviewState, query: RecallQuery, context: { telemetry?: TelemetryCollector; signal?: AbortSignal }): Promise<RecallHit[]> {
    const { telemetry, signal } = context;
    const observedQuery = query.scope === "resume" ? { ...query, query: "[resume query omitted]" } : query;
    const span = telemetry?.start("recall", "recall", undefined, { recall: { ...observedQuery, sourceStateVersion: state.traces.length, hits: [] } });
    try {
      if (query.projectId && !state.candidate.projects.some((p) => p.id === query.projectId)) throw new Error("Unknown project");
      const document = query.scope === "resume" ? this.document(state.sessionId) : undefined;
      const chunks: Chunk[] = query.scope === "resume" ? (document ? JSON.parse(document.chunks) : []) : [
        ...(query.scope === "turns" || query.scope === "both" ? state.turns.map((t) => ({ kind: "turn" as const, id: t.id, projectId: t.projectId, turnIndex: t.index, text: `问题：${t.question}\n回答：${t.answer}` })) : []),
        ...(query.scope === "evidence" || query.scope === "both" ? state.evidence.map((e) => ({ kind: "evidence" as const, id: e.id, projectId: e.projectId, turnIndex: state.turns.find((t) => t.id === e.turnId)?.index,
          text: `${e.statement}\n原话：${e.sourceQuote}\n能力：${e.competencyId}；深度：${e.depthLevel ?? "未知"}；性质：${e.polarity}` })) : []),
      ];
      const filtered = chunks.filter((c) => c.kind === "resume" || !query.projectId || c.projectId === query.projectId).map((c) => ({ ...c, text: c.text.slice(0, 1400), truncated: c.text.length > 1400 }));
      if (!filtered.length) { if (span) telemetry!.finish(span); return []; }
      const vectors = await this.index(state.sessionId, filtered, telemetry, signal);
      const embedding = telemetry?.start("recall_query_embedding", "embedding", span?.spanId, { model: this.client!.model });
      let vector: number[];
      try { [vector] = await this.client!.embed([query.query], signal); if (embedding) telemetry!.finish(embedding); }
      catch (error) { if (embedding) { telemetry!.error(embedding, "api_error", error); telemetry!.finish(embedding); } throw error; }
      signal?.throwIfAborted();
      if (query.scope === "resume" && this.document(state.sessionId)?.revision !== document?.revision) throw new Error("Resume was deleted or changed");
      const hits = filtered.map((c) => ({ ...c, score: cosine(vector, vectors.get(`${c.kind}:${c.id}`)!) })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, query.limit ?? 5);
      if (span) telemetry!.finish(span, { recall: { ...observedQuery, sourceStateVersion: state.traces.length,
        hits: hits.map(({ text: _, truncated: __, ...hit }) => hit) } });
      return hits;
    } catch (error) { if (span) { telemetry!.error(span, "api_error", error); telemetry!.finish(span); } throw error; }
  }
}
