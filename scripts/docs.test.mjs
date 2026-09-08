import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
test("maintained documentation has working local links", () => {
  for (const name of ["README.md", "docs/architecture.md", "docs/development.md", "knowledge/README.md"]) {
    const file = path.join(root, name);
    for (const match of readFileSync(file, "utf8").matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1].split("#")[0];
      if (!target || /^[a-z]+:/i.test(target)) continue;
      assert.ok(existsSync(path.resolve(path.dirname(file), target)), `${name} links to missing ${target}`);
    }
  }
});
