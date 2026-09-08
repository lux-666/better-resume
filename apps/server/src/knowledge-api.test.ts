import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { createApplication } from "./application.ts";
import type { RuntimeSet } from "./configured-runtimes.ts";
const runtimes: RuntimeSet = { report: { mode: "demo" }, interview: { mode: "demo" }, info: { mode: "demo" } };
test("HTTP exposes ready/unconfigured retrieval, validates filters and uses the persisted corpus", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "knowledge-api-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "cards.json"), JSON.stringify([{ id: "one", kind: "competency", domains: ["rag"], fieldKinds: ["mechanism"], depthLevels: [3], text: "RAG" }]));
  let embeds = 0;
  for (const configured of [true, false]) {
    const app = createApplication({ databasePath: join(root, "test.db"), knowledgeRoot: root, runtimes,
      embedding: configured ? { fingerprint: "test", model: "embed", embed: async (inputs) => { embeds += inputs.length; return inputs.map(() => [1, 0]); } } : undefined });
    await app.ready; app.server.listen(0, "127.0.0.1"); await once(app.server, "listening");
    try {
      const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
      const health = await (await fetch(`${base}/api/health`)).json() as { knowledge: { status: string } };
      assert.equal(health.knowledge.status, configured ? "ready" : "unconfigured");
      const search = await fetch(`${base}/api/knowledge/search`, { method: "POST", body: JSON.stringify({ query: "RAG", fieldKind: "mechanism", targetDepth: 3 }) });
      assert.equal(search.status, configured ? 200 : 503);
      if (configured) assert.equal(((await search.json()) as { hits: Array<{ id: string }> }).hits[0].id, "one");
      const invalid = await fetch(`${base}/api/knowledge/search`, { method: "POST", body: JSON.stringify({ query: "RAG", targetDepth: 9 }) });
      assert.equal(invalid.status, 400);
    } finally { await app.close(); }
  }
  assert.equal(embeds, 2);
});
