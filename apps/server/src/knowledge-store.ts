import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { EmbeddingClient } from "./embedding.ts";
import type { RerankClient } from "./rerank.ts";
import type { KnowledgeHit, KnowledgeQuery, KnowledgeStatus, ProbeKnowledge } from "../../../packages/pi-runtime/src/knowledge.ts";
import type { TelemetryCollector } from "../../../packages/pi-runtime/src/telemetry.ts";
import { KnowledgeSourceSchema, type KnowledgeSource } from "../../../packages/api-contract/src/telemetry.ts";
import { Check } from "typebox/value";

export function readKnowledgeCards(root: string) {
  const entries: unknown = JSON.parse(readFileSync(join(root, "cards.json"), "utf8"));
  if (!Array.isArray(entries)) throw new Error("Knowledge cards.json must contain an array");
  const cards = entries.map((entry: unknown, index) => {
    const location = `cards.json entry ${index + 1}`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`Invalid knowledge card: ${location}`);
    const meta = entry as Record<string, unknown>;
    const text = typeof meta.text === "string" ? meta.text.trim() : "";
    const strings = (key: string) => Array.isArray(meta[key]) && meta[key].every((item) => typeof item === "string");
    if (typeof meta.id !== "string" || !meta.id || typeof meta.kind !== "string" || !strings("domains") ||
      !strings("fieldKinds") || !Array.isArray(meta.depthLevels) || !meta.depthLevels.every((n) => Number.isInteger(n) && n >= 1 && n <= 5) || !text) {
      throw new Error(`Invalid knowledge card: ${location}`);
    }
    const source = Object.fromEntries(Object.keys(KnowledgeSourceSchema.properties).filter((key) => meta[key] !== undefined).map((key) => [key, meta[key]]));
    if (!Check(KnowledgeSourceSchema, source)) throw new Error(`Invalid knowledge source: ${location}`);
    const embeddingText = [
      `领域：${(meta.domains as string[]).join(", ")}`, `字段：${(meta.fieldKinds as string[]).join(", ")}`,
      source.originalQuestion && `原题（上游素材，可能含预设）：${source.originalQuestion}`,
      source.sourceFocus && `源题考察点：${source.sourceFocus}`, text,
    ].filter(Boolean).join("\n\n");
    return { id: meta.id, kind: meta.kind, domains: meta.domains as string[], fieldKinds: meta.fieldKinds as string[], source,
      depthLevels: meta.depthLevels as number[], text, sourcePath: "cards.json",
      embeddingText, embeddingHash: createHash("sha256").update(embeddingText).digest("hex"),
      contentHash: createHash("sha256").update(JSON.stringify(meta)).digest("hex") };
  });
  if (new Set(cards.map((card) => card.id)).size !== cards.length) throw new Error("Duplicate knowledge card ID");
  return cards;
}
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || !a.length) throw new Error("Embedding dimension mismatch");
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
type Row = { id: string; kind: string; text: string; embedding: Uint8Array; source_path: string; field_kinds: string; depth_levels: string; content_hash: string; embedding_hash: string; source_metadata: string };
function encode(vector: number[]): Buffer {
  const buffer = Buffer.alloc(vector.length * 8);
  vector.forEach((n, i) => buffer.writeDoubleLE(n, i * 8));
  return buffer;
}
function decode(vector: Uint8Array): number[] {
  const buffer = Buffer.from(vector);
  return Array.from({ length: buffer.length / 8 }, (_, i) => buffer.readDoubleLE(i * 8));
}

type Candidate = KnowledgeHit & { vector: number[]; terms: Set<string>; coverage: number; fusion: number; relevance: number };
const segmenter = new Intl.Segmenter("zh", { granularity: "word" });
const stopWords = new Set("的 了 和 是 与 如何 什么 为什么 有 哪些 一个 这个 可以 进行 需要 我们 你 在 对 用 时 来 中 或 什么样".split(" "));
function terms(text: string): string[] {
  return Array.from(segmenter.segment(text.toLowerCase())).filter((s) => s.isWordLike && !stopWords.has(s.segment)).map((s) => s.segment);
}
function hybridCandidates(rows: Row[], vector: number[], query: string) {
  const queryTerms = [...new Set(terms(query))];
  const documents = rows.map((row) => {
    const source = JSON.parse(row.source_metadata) as KnowledgeSource;
    const words = terms([source.originalQuestion, source.sourceFocus, source.originalQuestion ? undefined : row.text].filter(Boolean).join("\n"));
    const counts = new Map<string, number>();
    for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
    return { row, source, words, counts, vector: decode(row.embedding) };
  });
  const averageLength = documents.reduce((n, d) => n + d.words.length, 0) / (documents.length || 1) || 1;
  const idf = new Map(queryTerms.map((word) => {
    const frequency = documents.filter((d) => d.counts.has(word)).length;
    return [word, Math.log(1 + (documents.length - frequency + .5) / (frequency + .5))];
  }));
  const queryWeight = [...idf.values()].reduce((a, b) => a + b, 0) || 1;
  const scored = documents.map((d) => {
    let lexical = 0, covered = 0;
    for (const word of queryTerms) {
      const tf = d.counts.get(word) ?? 0;
      if (tf) covered += idf.get(word)!;
      lexical += idf.get(word)! * tf * 2.2 / (tf + 1.2 * (.25 + .75 * d.words.length / averageLength));
    }
    return { id: d.row.id, kind: d.row.kind, text: d.row.text, sourcePath: d.row.source_path, source: d.source,
      vector: d.vector, terms: new Set(d.words), score: cosine(vector, d.vector), lexical, coverage: covered / queryWeight };
  });
  const dense = scored.toSorted((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const lexical = scored.filter((d) => d.lexical > 0).toSorted((a, b) => b.lexical - a.lexical || a.id.localeCompare(b.id));
  const ranks = new Map(lexical.map((d, i) => [d.id, i + 1]));
  const candidates: Candidate[] = dense.map((d, i) => ({ ...d, fusion: 1 / (60 + i + 1) + (ranks.has(d.id) ? 1 / (60 + ranks.get(d.id)!) : 0),
    relevance: .75 * Math.min(1, Math.max(0, d.score) / .6) + .25 * d.coverage }))
    .sort((a, b) => b.fusion - a.fusion || b.score - a.score || a.id.localeCompare(b.id));
  const first = dense[0];
  const gap = first ? first.score - (dense[1]?.score ?? 0) : 0;
  // These conservative gates are heuristics, not calibrated probabilities or portable model thresholds.
  const confidence = first && first.id === lexical[0]?.id && first.score >= .6 && first.coverage >= .45 && gap >= .06 ? "high"
    : first && (first.score >= .4 || (lexical[0]?.coverage ?? 0) >= .35) ? "medium" : "low";
  return { candidates, confidence, gap } as const;
}
function selectContext(candidates: Candidate[], threshold: number): KnowledgeHit[] {
  const ranked = candidates.filter((c) => c.relevance >= threshold).toSorted((a, b) => b.relevance - a.relevance || b.fusion - a.fusion || a.id.localeCompare(b.id));
  const distinct: Candidate[] = [];
  for (const candidate of ranked) {
    const duplicate = distinct.some((prior) => {
      const intersection = [...candidate.terms].filter((t) => prior.terms.has(t)).length;
      const union = candidate.terms.size + prior.terms.size - intersection;
      return cosine(candidate.vector, prior.vector) >= .98 && intersection / (union || 1) >= .8;
    });
    if (!duplicate) distinct.push(candidate);
  }
  // Count distinct cards before applying the gap; two duplicates must not hide a useful third card.
  const gapIndex = distinct.findIndex((c, i) => i >= 2 && distinct[i - 1].relevance - c.relevance >= .2);
  const remaining = gapIndex < 0 ? distinct : distinct.slice(0, gapIndex);
  const selected: Candidate[] = [];
  while (remaining.length && selected.length < 8) {
    let bestIndex = -1, bestScore = -Infinity;
    for (const [i, candidate] of remaining.entries()) {
      let similarity = 0;
      for (const prior of selected) {
        const cosineSimilarity = Math.max(0, cosine(candidate.vector, prior.vector));
        similarity = Math.max(similarity, cosineSimilarity);
      }
      const mmr = .8 * candidate.relevance - .2 * similarity;
      if (mmr > bestScore) { bestScore = mmr; bestIndex = i; }
    }
    if (bestIndex < 0 || (selected.length >= 2 && bestScore < .2)) break;
    selected.push(remaining.splice(bestIndex, 1)[0]);
  }
  return selected.map(({ id, kind, text, sourcePath, source, score, rerankScore }) => ({ id, kind, text, sourcePath, source, score, ...(rerankScore === undefined ? {} : { rerankScore }) }));
}

export class KnowledgeStore implements ProbeKnowledge {
  private state: KnowledgeStatus;
  constructor(private readonly database: DatabaseSync, private readonly client?: EmbeddingClient, private readonly reranker?: RerankClient) {
    this.state = { status: client ? "indexing" : "unconfigured", count: 0, model: client?.model,
      ...(!client ? { reason: "Embedding model, URL or API key is not configured" } : {}) };
    database.exec(`CREATE TABLE IF NOT EXISTS knowledge_chunks(
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, domains TEXT NOT NULL, field_kinds TEXT NOT NULL,
      depth_levels TEXT NOT NULL, text TEXT NOT NULL, embedding BLOB NOT NULL, source_path TEXT NOT NULL,
      content_hash TEXT NOT NULL, embedding_fingerprint TEXT NOT NULL);`);
    const columns = database.prepare("PRAGMA table_info(knowledge_chunks)").all() as Array<{ name: string }>;
    for (const [name, fallback] of [["embedding_hash", ""], ["source_metadata", "{}"]]) {
      if (!columns.some((column) => column.name === name)) database.exec(`ALTER TABLE knowledge_chunks ADD COLUMN ${name} TEXT NOT NULL DEFAULT '${fallback}'`);
    }
  }
  health(): KnowledgeStatus { return { ...this.state, ...(this.reranker ? { rerankModel: this.reranker.model } : {}) }; }
  async index(root: string, signal?: AbortSignal): Promise<{ indexed: number; skipped: number; durationMs: number }> {
    const started = performance.now();
    if (!this.client) return { indexed: 0, skipped: 0, durationMs: 0 };
    this.state = { status: "indexing", count: 0, model: this.client.model };
    try {
      const cards = readKnowledgeCards(root);
      if (!cards.length) throw new Error("No knowledge cards found");
      const rows = this.database.prepare("SELECT id,embedding_hash,embedding_fingerprint,embedding FROM knowledge_chunks").all() as Array<Pick<Row, "id" | "embedding_hash" | "embedding"> & { embedding_fingerprint: string }>;
      const old = new Map(rows.map((row) => [row.id, row]));
      const pending = cards.filter((card) => old.get(card.id)?.embedding_hash !== card.embeddingHash || old.get(card.id)?.embedding_fingerprint !== this.client!.fingerprint);
      const vectors = new Map<string, number[]>();
      for (let i = 0; i < pending.length; i += 10) {
        const batch = pending.slice(i, i + 10);
        const embedded = await this.client.embed(batch.map((card) => card.embeddingText), signal);
        batch.forEach((card, n) => vectors.set(card.id, embedded[n]));
      }
      signal?.throwIfAborted();
      const dimensions = new Set(cards.map((card) => vectors.get(card.id)?.length ?? old.get(card.id)!.embedding.byteLength / 8));
      if (dimensions.size !== 1) throw new Error("Embedding dimension changed; rebuild with a new model configuration");
      // Readers see a complete corpus; failed requests never publish a partial rebuild.
      this.database.exec("BEGIN IMMEDIATE");
      try {
        this.database.exec("DELETE FROM knowledge_chunks");
        const insert = this.database.prepare(`INSERT INTO knowledge_chunks
          (id,kind,domains,field_kinds,depth_levels,text,embedding,source_path,content_hash,embedding_fingerprint,embedding_hash,source_metadata)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
        for (const card of cards) insert.run(card.id, card.kind, JSON.stringify(card.domains), JSON.stringify(card.fieldKinds), JSON.stringify(card.depthLevels), card.text,
          vectors.has(card.id) ? encode(vectors.get(card.id)!) : old.get(card.id)!.embedding, card.sourcePath, card.contentHash, this.client.fingerprint,
          card.embeddingHash, JSON.stringify(card.source));
        this.database.exec("COMMIT");
      } catch (error) { this.database.exec("ROLLBACK"); throw error; }
      this.state = { status: "ready", count: cards.length, model: this.client.model };
      return { indexed: pending.length, skipped: cards.length - pending.length, durationMs: performance.now() - started };
    } catch (error) {
      this.state = { status: "failed", count: 0, model: this.client.model, reason: "Knowledge indexing failed; static playbook is active" };
      throw error;
    }
  }
  async retrieve(query: KnowledgeQuery, context: { telemetry?: TelemetryCollector; signal?: AbortSignal; forceRerank?: boolean } = {}): Promise<KnowledgeHit[]> {
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
      const filtered = rows.filter((row) => (!query.fieldKind || JSON.parse(row.field_kinds).includes(query.fieldKind)) &&
        (!query.targetDepth || JSON.parse(row.depth_levels).includes(query.targetDepth)));
      const { candidates: ranked, confidence, gap } = hybridCandidates(filtered, vector, query.query);
      let candidates = ranked.slice(0, 20);
      if (confidence === "low") candidates = ranked.slice(0, 50);
      const localDurationMs = performance.now() - started;
      let rerank: { model: string; status: "succeeded" | "fallback"; candidateCount: number; durationMs: number; reason?: string } | undefined;
      if (this.reranker && (confidence !== "high" || context.forceRerank) && candidates.length) {
        const rerankStarted = performance.now();
        rerank = { model: this.reranker.model, status: "fallback", candidateCount: candidates.length, durationMs: 0 };
        try {
          const scores = await this.reranker.rerank(query.query, candidates.map((hit) => hit.source?.originalQuestion ? [hit.source.originalQuestion, hit.source.sourceFocus].filter(Boolean).join("\n\n") : hit.text), signal);
          if (scores.length !== candidates.length || Array.from(scores).some((s) => !Number.isFinite(s) || s < 0 || s > 1)) throw new Error("Invalid reranker scores");
          candidates = candidates.map((hit, index) => ({ ...hit, rerankScore: scores[index], relevance: scores[index] }));
          rerank.status = "succeeded";
        } catch (error) {
          rerank.reason = error instanceof Error && error.name === "TimeoutError" ? "timeout" : "provider_or_response_error";
          // Provider failure preserves hybrid candidates; command cancellation must still propagate.
          signal?.throwIfAborted();
        } finally { rerank.durationMs = performance.now() - rerankStarted; }
      }
      signal?.throwIfAborted();
      const selectionStarted = performance.now();
      const threshold = confidence === "high" && !rerank ? Math.max(.45, Math.max(0, ...candidates.map((c) => c.relevance)) - .12) : .45;
      const hits = selectContext(candidates, threshold);
      if (span) telemetry!.finish(span, { retrieval: { ...query, hits, referencedIds: [], localDurationMs: localDurationMs + performance.now() - selectionStarted,
        cascade: { confidence, candidateCount: candidates.length, expanded: confidence === "low", denseGap: gap, returnedCount: hits.length,
          rerankSkipped: confidence === "high" && !context.forceRerank ? "high_confidence" : !candidates.length ? "empty" : !this.reranker ? "unconfigured" : undefined },
        ...(rerank ? { rerank } : {}) } });
      return hits;
    } catch (error) {
      if (span) { telemetry!.error(span, "api_error", error, true); telemetry!.finish(span, { retrieval: { ...query, hits: [], referencedIds: [], fallback: "static_playbook" } }); }
      throw error;
    }
  }
}
