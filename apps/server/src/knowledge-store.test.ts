import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { KnowledgeStore, readKnowledgeCards } from "./knowledge-store.ts";
import { configuredEmbedding } from "./embedding.ts";
import { TelemetryCollector } from "../../../packages/pi-runtime/src/telemetry.ts";
const card = (id: string, text: string, fields = ["mechanism"], depths = [3, 4]) => `---\nid: "${id}"\nkind: "competency"\ndomains: ["ai"]\nfieldKinds: ${JSON.stringify(fields)}\ndepthLevels: ${JSON.stringify(depths)}\n---\n${text}`;
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
  writeFileSync(join(root, "one.md"), card("one", "RAG"));
  writeFileSync(join(root, "two.md"), card("two", "memory"));
  const first = new KnowledgeStore(database, client);
  assert.equal((await first.index(root)).indexed, 2);
  const restarted = new KnowledgeStore(database, client);
  assert.equal((await restarted.index(root)).skipped, 2); assert.equal(calls, 2);
  writeFileSync(join(root, "one.md"), card("one", "new RAG")); unlinkSync(join(root, "two.md"));
  assert.equal((await restarted.index(root)).indexed, 1);
  assert.equal((database.prepare("SELECT count(*) AS n FROM knowledge_chunks").get() as { n: number }).n, 1);
  assert.equal((await restarted.retrieve({ query: "new RAG" }))[0].text, "new RAG");
  const changed = new KnowledgeStore(database, { ...client, fingerprint: "model-b", model: "b" });
  assert.equal((await changed.index(root)).indexed, 1);
});
test("failed rebuild preserves the previous complete index but exposes fallback", async (t) => {
  const { root, database } = fixture(t);
  writeFileSync(join(root, "one.md"), card("one", "original"));
  const client = { fingerprint: "a", model: "a", embed: async () => [[1, 0]] };
  await new KnowledgeStore(database, client).index(root);
  writeFileSync(join(root, "one.md"), card("one", "edited"));
  const failing = new KnowledgeStore(database, { ...client, embed: async () => { throw new Error("offline"); } });
  await assert.rejects(failing.index(root)); assert.equal(failing.health().status, "failed");
  assert.equal((database.prepare("SELECT text FROM knowledge_chunks").get() as { text: string }).text, "original");
  await assert.rejects(failing.retrieve({ query: "RAG" }));
});
test("retrieval filters metadata before ranking and records timings, text and explicit failures", async (t) => {
  const { root, database } = fixture(t);
  writeFileSync(join(root, "rag.md"), card("rag", "RAG"));
  writeFileSync(join(root, "memory.md"), card("memory", "memory", ["failure"], [5]));
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
test("twenty source cards have stable IDs and valid metadata", () => {
  const cards = readKnowledgeCards(fileURLToPath(new URL("../../../knowledge", import.meta.url)));
  assert.equal(cards.length, 20);
  assert.equal(new Set(cards.map((card) => card.id)).size, 20);
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
  const path = join(root, "one.md");
  const raw = card("one", "# 幂等\n本项目整理：追问执行结果未知时的恢复路径。").replace('kind: "competency"', 'kind: "competency"\nsourceUrl: "https://example.com/old"\nsourceCommit: "commit-a"\noriginalQuestion: "如何避免重复提交？"\nsourceFocus: "checkpoint 与幂等"');
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
