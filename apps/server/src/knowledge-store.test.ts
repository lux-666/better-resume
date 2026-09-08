import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { KnowledgeStore, readKnowledgeCards } from "./knowledge-store.ts";
import { configuredEmbedding } from "./embedding.ts";
import { TelemetryCollector } from "../../../packages/pi-runtime/src/telemetry.ts";
const card = (id: string, text: string, fields = ["mechanism"], depths = [3, 4]) =>
  ({ id, kind: "competency", domains: ["ai"], fieldKinds: fields, depthLevels: depths, text });
const writeCards = (root: string, ...cards: ReturnType<typeof card>[]) => writeFileSync(join(root, "cards.json"), JSON.stringify(cards));
function fixture(t: { after: (fn: () => void) => void }) {
  const root = mkdtempSync(join(tmpdir(), "knowledge-test-"));
  const database = new DatabaseSync(join(root, "test.db"));
  t.after(() => { database.close(); rmSync(root, { recursive: true, force: true }); });
  return { root, database };
}
test("incremental corpus survives restart, replaces edits/deletions and rebuilds on model change", async (t) => {
  const { root, database } = fixture(t);
  let calls = 0;
  const client = { fingerprint: "model-a", model: "a", embed: async (inputs: string[]) => { calls += inputs.length; return inputs.map(() => [1, 0]); } };
  writeCards(root, card("one", "RAG"), card("two", "memory"));
  const first = new KnowledgeStore(database, client);
  assert.equal((await first.index(root)).indexed, 2);
  const restarted = new KnowledgeStore(database, client);
  assert.equal((await restarted.index(root)).skipped, 2); assert.equal(calls, 2);
  writeCards(root, card("one", "new RAG"));
  assert.equal((await restarted.index(root)).indexed, 1);
  assert.equal((database.prepare("SELECT count(*) AS n FROM knowledge_chunks").get() as { n: number }).n, 1);
  assert.equal((await restarted.retrieve({ query: "new RAG" }))[0].text, "new RAG");
  const changed = new KnowledgeStore(database, { ...client, fingerprint: "model-b", model: "b" });
  assert.equal((await changed.index(root)).indexed, 1);
});
test("failed rebuild preserves the previous complete index but exposes fallback", async (t) => {
  const { root, database } = fixture(t);
  writeCards(root, card("one", "original"));
  const client = { fingerprint: "a", model: "a", embed: async () => [[1, 0]] };
  await new KnowledgeStore(database, client).index(root);
  writeCards(root, card("one", "edited"));
  const failing = new KnowledgeStore(database, { ...client, embed: async () => { throw new Error("offline"); } });
  await assert.rejects(failing.index(root)); assert.equal(failing.health().status, "failed");
  assert.equal((database.prepare("SELECT text FROM knowledge_chunks").get() as { text: string }).text, "original");
  await assert.rejects(failing.retrieve({ query: "RAG" }));
});
test("malformed or duplicate source entries never publish a partial corpus", async (t) => {
  const { root, database } = fixture(t);
  const original = card("one", "original");
  writeCards(root, original);
  let calls = 0;
  const store = new KnowledgeStore(database, { fingerprint: "a", model: "a", embed: async (texts) => { calls++; return texts.map(() => [1, 0]); } });
  await store.index(root);
  for (const invalid of [null, {}, [original, null], [original, original], [original, { ...card("two", ""), text: " " }],
    [original, { ...card("two", "valid"), sourceUrl: 42 }], [original, { ...card("two", "valid"), depthLevels: [9] }]]) {
    writeFileSync(join(root, "cards.json"), JSON.stringify(invalid));
    await assert.rejects(store.index(root));
    assert.equal(store.health().status, "failed");
    assert.deepEqual(database.prepare("SELECT id,text FROM knowledge_chunks").all().map((row) => ({ ...row })), [{ id: "one", text: "original" }]);
  }
  assert.equal(calls, 1);
});
test("retrieval filters metadata before ranking and records timings, text and explicit failures", async (t) => {
  const { root, database } = fixture(t);
  writeCards(root, card("rag", "RAG"), card("memory", "memory", ["failure"], [5]));
  const client = { fingerprint: "a", model: "a", embed: async (inputs: string[]) => inputs.map((text) => text.endsWith("memory") ? [0, 1] : [1, 0]) };
  const knowledge = new KnowledgeStore(database, client); await knowledge.index(root);
  const telemetry = new TelemetryCollector();
  assert.deepEqual((await knowledge.retrieve({ query: "RAG", fieldKind: "mechanism", targetDepth: 3 }, { telemetry })).map((hit) => hit.id), ["rag"]);
  assert.deepEqual(await knowledge.retrieve({ query: "RAG", fieldKind: "mechanism", targetDepth: 5 }), []);
  const span = telemetry.trace.spans.find((span) => span.retrieval)!;
  assert.equal(span.retrieval!.hits[0].text, "RAG"); assert.ok(span.retrieval!.localDurationMs! >= 0);
  assert.ok(telemetry.trace.spans.some((span) => span.kind === "embedding" && span.status === "succeeded"));
  const absent = new KnowledgeStore(database);
  await assert.rejects(absent.retrieve({ query: "RAG" }, { telemetry }));
  assert.equal(telemetry.trace.spans.at(-1)!.retrieval!.fallback, "static_playbook");
  assert.equal(absent.health().status, "unconfigured");
});
test("full source cards have stable IDs and valid metadata", () => {
  const cards = readKnowledgeCards(fileURLToPath(new URL("../../../knowledge", import.meta.url)));
  assert.equal(cards.length, 338);
  assert.equal(new Set(cards.map((card) => card.id)).size, 338);
  assert.ok(cards.every((card) => card.kind === "competency" && card.fieldKinds.every((kind) => ["ownership", "mechanism", "measurement", "failure"].includes(kind))));
});
test("embedding configuration is separate and blank overrides inherit chat settings", () => {
  assert.equal(configuredEmbedding({}), undefined);
  const inherited = configuredEmbedding({ LLM_EMBEDDING_MODEL: "embed", LLM_EMBEDDING_BASE_URL: "", LLM_EMBEDDING_API_KEY: "", LLM_BASE_URL: "https://chat/v1", LLM_API_KEY: "chat" })!;
  assert.equal(inherited.fingerprint, JSON.stringify(["https://chat/v1", "embed"]));
  const separate = configuredEmbedding({ LLM_EMBEDDING_MODEL: "embed", LLM_EMBEDDING_BASE_URL: "https://embedding/v1/", LLM_EMBEDDING_API_KEY: "embedding", LLM_BASE_URL: "https://chat/v1", LLM_API_KEY: "chat" })!;
  assert.equal(separate.fingerprint, JSON.stringify(["https://embedding/v1", "embed"]));
});
test("embedding client sends an independent request, restores response order and rejects malformed vectors", async (t) => {
  let response: unknown = { data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }] };
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => { requests.push({ url, init }); return new Response(JSON.stringify(response)); });
  const client = configuredEmbedding({ LLM_EMBEDDING_MODEL: "embed", LLM_EMBEDDING_BASE_URL: "https://embedding/v1/", LLM_EMBEDDING_API_KEY: "embed-key", LLM_API_KEY: "chat-key" })!;
  assert.deepEqual(await client.embed(["a", "b"]), [[1, 0], [0, 1]]);
  assert.equal(requests[0].url, "https://embedding/v1/embeddings");
  assert.equal((requests[0].init?.headers as Record<string, string>).authorization, "Bearer embed-key");
  assert.deepEqual(JSON.parse(requests[0].init?.body as string), { model: "embed", input: ["a", "b"], encoding_format: "float" });
  for (const invalid of [[], [{ index: 1, embedding: [1, 0] }], [{ index: 0, embedding: [0, 0] }], [{ index: 0, embedding: [null, 1] }]]) {
    response = { data: invalid }; await assert.rejects(client.embed(["a"]));
  }
});
test("legacy index rebuilds semantic inputs once and retains source-only edits without embedding", async (t) => {
  const { root, database } = fixture(t);
  database.exec(`CREATE TABLE knowledge_chunks(id TEXT PRIMARY KEY, kind TEXT NOT NULL, domains TEXT NOT NULL, field_kinds TEXT NOT NULL,
    depth_levels TEXT NOT NULL, text TEXT NOT NULL, embedding BLOB NOT NULL, source_path TEXT NOT NULL, content_hash TEXT NOT NULL, embedding_fingerprint TEXT NOT NULL)`);
  database.prepare("INSERT INTO knowledge_chunks VALUES(?,?,?,?,?,?,?,?,?,?)").run("one", "competency", '["ai"]', '["mechanism"]', '[3,4]', "old", Buffer.alloc(16), "one.md", "old", "a");
  const path = join(root, "cards.json");
  const raw = JSON.stringify([{ ...card("one", "# 幂等\n本项目整理：追问执行结果未知时的恢复路径。"),
    sourceUrl: "https://example.com/old", sourceCommit: "commit-a", originalQuestion: "如何避免重复提交？", sourceFocus: "checkpoint 与幂等" }]);
  writeFileSync(path, raw);
  const inputs: string[] = [];
  const client = { fingerprint: "a", model: "a", embed: async (texts: string[]) => { inputs.push(...texts); return texts.map(() => [1, 0]); } };
  const knowledge = new KnowledgeStore(database, client);
  assert.equal((await knowledge.index(root)).indexed, 1);
  assert.match(inputs[0], /领域：ai/); assert.match(inputs[0], /字段：mechanism/);
  assert.match(inputs[0], /如何避免重复提交/); assert.match(inputs[0], /checkpoint 与幂等/);
  assert.match(inputs[0], /本项目整理/); assert.doesNotMatch(inputs[0], /example.com|commit-a|id:|one/);
  writeFileSync(path, raw.replace("example.com/old", "example.com/new").replace("commit-a", "commit-b"));
  assert.equal((await new KnowledgeStore(database, client).index(root)).skipped, 1);
  assert.equal(inputs.length, 1);
  const stored = database.prepare("SELECT content_hash,source_metadata FROM knowledge_chunks").get() as { content_hash: string; source_metadata: string };
  assert.equal(stored.content_hash, readKnowledgeCards(root)[0].contentHash);
  assert.equal(JSON.parse(stored.source_metadata).sourceCommit, "commit-b");
  const [hit] = await knowledge.retrieve({ query: "重复提交" });
  assert.equal(hit.source?.sourceUrl, "https://example.com/new");
  assert.equal(hit.source?.originalQuestion, "如何避免重复提交？");
  writeFileSync(path, readFileSync(path, "utf8").replace('["ai"]', '["reliability"]'));
  assert.equal((await knowledge.index(root)).indexed, 1);
});


function cascadeFixture(t: Parameters<typeof fixture>[0], count: number, similarity: number) {
  const { root, database } = fixture(t);
  writeCards(root, ...Array.from({ length: count }, (_, i) => card(`item-${String(i).padStart(2, "0")}`, `topic-${i}`)));
  const client = { fingerprint: "cascade", model: "embedding", embed: async (inputs: string[]) => inputs.map((text) => {
    const vector = Array<number>(count + 1).fill(0), index = text.match(/topic-(\d+)$/)?.[1];
    vector[0] = index === undefined ? 1 : similarity;
    if (index !== undefined) vector[Number(index) + 1] = Math.sqrt(1 - similarity ** 2);
    return vector;
  }) };
  return { root, database, client };
}
test("high confidence agrees across retrieval channels and avoids mini entirely", async (t) => {
  const { root, database } = fixture(t);
  writeCards(root, card("correct", "needle mechanism"), card("wrong", "unrelated"));
  const client = { fingerprint: "high", model: "embedding", embed: async (xs: string[]) => xs.map((s) => s.endsWith("unrelated") ? [.6, .8] : [1, 0]) };
  let calls = 0;
  const store = new KnowledgeStore(database, client, { model: "mini", rerank: async () => { calls++; return []; } });
  await store.index(root);
  const telemetry = new TelemetryCollector();
  assert.deepEqual((await store.retrieve({ query: "needle mechanism" }, { telemetry })).map((h) => h.id), ["correct"]);
  assert.equal(calls, 0); assert.equal(telemetry.trace.spans[0].retrieval!.cascade!.confidence, "high");
  assert.equal(telemetry.trace.spans[0].retrieval!.cascade!.rerankSkipped, "high_confidence");
});
test("medium confidence reranks twenty filtered candidates and returns only the useful pair", async (t) => {
  const { root, database, client } = cascadeFixture(t, 55, .55);
  writeCards(root, ...JSON.parse(readFileSync(join(root, "cards.json"), "utf8")), card("excluded", "PRIVATE", ["failure"]));
  const store = new KnowledgeStore(database, client, { model: "mini", rerank: async (_, docs) => {
    assert.equal(docs.length, 20); assert.ok(docs.every((d) => !d.includes("PRIVATE")));
    return docs.map((_, i) => i === 19 ? .95 : i === 18 ? .85 : .2);
  } });
  await store.index(root); const telemetry = new TelemetryCollector();
  const hits = await store.retrieve({ query: "unmatched", fieldKind: "mechanism" }, { telemetry });
  assert.deepEqual(hits.map((h) => h.id), ["item-19", "item-18"]);
  assert.ok(Math.abs(hits[0].score - .55) < .0001); assert.equal(hits[0].rerankScore, .95);
  assert.equal(telemetry.trace.spans[0].retrieval!.cascade!.confidence, "medium");
});
test("low confidence expands to fifty and can rescue a result outside the initial twenty", async (t) => {
  const { root, database, client } = cascadeFixture(t, 55, .1);
  const store = new KnowledgeStore(database, client, { model: "mini", rerank: async (_, docs) => {
    assert.equal(docs.length, 50); return docs.map((_, i) => i === 45 ? .95 : i === 44 ? .85 : .1);
  } });
  await store.index(root); const telemetry = new TelemetryCollector();
  assert.deepEqual((await store.retrieve({ query: "unmatched" }, { telemetry })).map((h) => h.id), ["item-45", "item-44"]);
  assert.equal(telemetry.trace.spans[0].retrieval!.cascade!.expanded, true);
});
test("gap truncation and MMR remove redundant context without padding to two", async (t) => {
  const { root, database, client } = cascadeFixture(t, 10, .7);
  let scores = [.95, .94, .6, .58, .57, .56, .55, .54, .53, .52];
  const store = new KnowledgeStore(database, client, { model: "mini", rerank: async () => scores });
  await store.index(root);
  assert.equal((await store.retrieve({ query: "unmatched" })).length, 2);
  scores = Array(10).fill(.8);
  assert.equal((await store.retrieve({ query: "unmatched" })).length, 8);
  scores = Array(10).fill(.1);
  assert.equal((await store.retrieve({ query: "unmatched" })).length, 0);
  const duplicateVector = database.prepare("SELECT embedding FROM knowledge_chunks WHERE id='item-00'").get()!.embedding;
  database.prepare("UPDATE knowledge_chunks SET text='topic-0',embedding=? WHERE id='item-01'").run(duplicateVector);
  scores = [.95, .94, .1, .1, .1, .1, .1, .1, .1, .1];
  assert.equal((await store.retrieve({ query: "unmatched" })).length, 1);
  scores = [.95, .94, .6, .1, .1, .1, .1, .1, .1, .1];
  assert.deepEqual((await store.retrieve({ query: "unmatched" })).map((h) => h.id), ["item-00", "item-02"]);
});
test("mini failure uses filtered hybrid context, and caller cancellation is never swallowed", async (t) => {
  const { root, database, client } = cascadeFixture(t, 30, .7);
  const abort = new AbortController(); let cancel = false;
  const store = new KnowledgeStore(database, client, { model: "mini", rerank: async () => { if (cancel) abort.abort(); throw new Error("offline"); } });
  await store.index(root); const telemetry = new TelemetryCollector();
  const hits = await store.retrieve({ query: "unmatched" }, { telemetry });
  assert.ok(hits.length >= 2 && hits.length <= 8);
  assert.equal(telemetry.trace.spans[0].retrieval!.rerank!.status, "fallback");
  cancel = true; await assert.rejects(store.retrieve({ query: "unmatched" }, { signal: abort.signal }));
});
