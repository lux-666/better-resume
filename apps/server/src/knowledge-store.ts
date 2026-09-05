import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { EmbeddingClient } from "./embedding.ts";
import type { KnowledgeHit, KnowledgeQuery, KnowledgeStatus, ProbeKnowledge } from "../../../packages/pi-runtime/src/knowledge.ts";
import type { TelemetryCollector } from "../../../packages/pi-runtime/src/telemetry.ts";

function walk(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? walk(path) : path.endsWith(".md") ? [path] : [];
  }).sort();
}
export function readKnowledgeCards(root: string) {
  const cards = walk(root).flatMap((path) => {
    const raw = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
    const frontmatter = raw.match(/^---\n([\s\S]*?)\n---\n?/);
    if (!frontmatter) return [];
    const meta: Record<string, unknown> = {};
    for (const line of frontmatter[1].split("\n")) {
      const match = line.match(/^([A-Za-z][\w-]*):\s*(.+)$/);
      if (match) meta[match[1]] = JSON.parse(match[2]);
    }
    const text = raw.slice(frontmatter[0].length).trim();
    const strings = (key: string) => Array.isArray(meta[key]) && meta[key].every((item) => typeof item === "string");
    if (typeof meta.id !== "string" || !meta.id || typeof meta.kind !== "string" || !strings("domains") ||
      !strings("fieldKinds") || !Array.isArray(meta.depthLevels) || !meta.depthLevels.every((n) => Number.isInteger(n) && n >= 1 && n <= 5) || !text) {
      throw new Error(`Invalid knowledge card: ${relative(root, path)}`);
    }
    return [{ id: meta.id, kind: meta.kind, domains: meta.domains as string[], fieldKinds: meta.fieldKinds as string[],
      depthLevels: meta.depthLevels as number[], text, sourcePath: relative(root, path),
      contentHash: createHash("sha256").update(raw).digest("hex") }];
  });
  if (new Set(cards.map((card) => card.id)).size !== cards.length) throw new Error("Duplicate knowledge card ID");
  if (cards.length > 300) throw new Error("Knowledge pilot supports at most 300 cards");
  return cards;
}
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || !a.length) throw new Error("Embedding dimension mismatch");
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
type Row = { id: string; kind: string; text: string; embedding: Uint8Array; source_path: string; field_kinds: string; depth_levels: string; content_hash: string };
function encode(vector: number[]): Buffer {
  const buffer = Buffer.alloc(vector.length * 8);
  vector.forEach((n, i) => buffer.writeDoubleLE(n, i * 8));
  return buffer;
}
function decode(vector: Uint8Array): number[] {
  const buffer = Buffer.from(vector);
  return Array.from({ length: buffer.length / 8 }, (_, i) => buffer.readDoubleLE(i * 8));
}
export class KnowledgeStore implements ProbeKnowledge {
  private state: KnowledgeStatus;
  constructor(private readonly database: DatabaseSync, private readonly client?: EmbeddingClient) {
    this.state = { status: client ? "indexing" : "unconfigured", count: 0, model: client?.model,
      ...(!client ? { reason: "Embedding model, URL or API key is not configured" } : {}) };
    database.exec(`CREATE TABLE IF NOT EXISTS knowledge_chunks(
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, domains TEXT NOT NULL, field_kinds TEXT NOT NULL,
      depth_levels TEXT NOT NULL, text TEXT NOT NULL, embedding BLOB NOT NULL, source_path TEXT NOT NULL,
      content_hash TEXT NOT NULL, embedding_fingerprint TEXT NOT NULL);`);
  }
  health(): KnowledgeStatus { return { ...this.state }; }
  async index(root: string, signal?: AbortSignal): Promise<{ indexed: number; skipped: number; durationMs: number }> {
    const started = performance.now();
    if (!this.client) return { indexed: 0, skipped: 0, durationMs: 0 };
    this.state = { status: "indexing", count: 0, model: this.client.model };
    try {
      const cards = readKnowledgeCards(root);
      if (!cards.length) throw new Error("No knowledge cards found");
      const rows = this.database.prepare("SELECT id,content_hash,embedding_fingerprint,embedding FROM knowledge_chunks").all() as Array<Pick<Row, "id" | "content_hash" | "embedding"> & { embedding_fingerprint: string }>;
      const old = new Map(rows.map((row) => [row.id, row]));
      const pending = cards.filter((card) => old.get(card.id)?.content_hash !== card.contentHash || old.get(card.id)?.embedding_fingerprint !== this.client!.fingerprint);
      const vectors = new Map<string, number[]>();
      for (let i = 0; i < pending.length; i += 10) {
        const batch = pending.slice(i, i + 10);
        const embedded = await this.client.embed(batch.map((card) => card.text), signal);
        batch.forEach((card, n) => vectors.set(card.id, embedded[n]));
      }
      signal?.throwIfAborted();
      const dimensions = new Set(cards.map((card) => vectors.get(card.id)?.length ?? old.get(card.id)!.embedding.byteLength / 8));
      if (dimensions.size !== 1) throw new Error("Embedding dimension changed; rebuild with a new model configuration");
      // Readers see a complete corpus; failed requests never publish a partial rebuild.
      this.database.exec("BEGIN IMMEDIATE");
      try {
        this.database.exec("DELETE FROM knowledge_chunks");
        const insert = this.database.prepare("INSERT INTO knowledge_chunks VALUES(?,?,?,?,?,?,?,?,?,?)");
        for (const card of cards) insert.run(card.id, card.kind, JSON.stringify(card.domains), JSON.stringify(card.fieldKinds), JSON.stringify(card.depthLevels), card.text,
          vectors.has(card.id) ? encode(vectors.get(card.id)!) : old.get(card.id)!.embedding, card.sourcePath, card.contentHash, this.client.fingerprint);
        this.database.exec("COMMIT");
      } catch (error) { this.database.exec("ROLLBACK"); throw error; }
      this.state = { status: "ready", count: cards.length, model: this.client.model };
      return { indexed: pending.length, skipped: cards.length - pending.length, durationMs: performance.now() - started };
    } catch (error) {
      this.state = { status: "failed", count: 0, model: this.client.model, reason: "Knowledge indexing failed; static playbook is active" };
      throw error;
    }
  }
  async retrieve(query: KnowledgeQuery, context: { telemetry?: TelemetryCollector; signal?: AbortSignal } = {}): Promise<KnowledgeHit[]> {
    const { telemetry, signal } = context;
    const parent = telemetry?.trace.spans.findLast((span) => span.kind === "tool" && span.toolName === "retrieve_probe_knowledge" && span.status === "running");
    const span = telemetry?.start("retrieve_probe_knowledge", "retrieval", parent?.spanId, { retrieval: { ...query, hits: [], referencedIds: [] } });
    try {
      if (this.state.status !== "ready") throw new Error(`Knowledge is ${this.state.status}`);
      const embeddingSpan = telemetry?.start("query_embedding", "embedding", span?.spanId, { model: this.client!.model });
      let vector: number[];
      try { [vector] = await this.client!.embed([query.query], signal); if (embeddingSpan) telemetry!.finish(embeddingSpan); }
      catch (error) { if (embeddingSpan) { telemetry!.error(embeddingSpan, "api_error", error); telemetry!.finish(embeddingSpan); } throw error; }
      signal?.throwIfAborted();
      const started = performance.now();
      const rows = this.database.prepare("SELECT * FROM knowledge_chunks").all() as Row[];
      const hits = rows.filter((row) => (!query.fieldKind || JSON.parse(row.field_kinds).includes(query.fieldKind)) &&
        (!query.targetDepth || JSON.parse(row.depth_levels).includes(query.targetDepth)))
        .map((row) => ({ id: row.id, kind: row.kind, text: row.text, sourcePath: row.source_path, score: cosine(vector, decode(row.embedding)) }))
        .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 3);
      if (span) telemetry!.finish(span, { retrieval: { ...query, hits, referencedIds: [], localDurationMs: performance.now() - started } });
      return hits;
    } catch (error) {
      if (span) { telemetry!.error(span, "api_error", error, true); telemetry!.finish(span, { retrieval: { ...query, hits: [], referencedIds: [], fallback: "static_playbook" } }); }
      throw error;
    }
  }
}
