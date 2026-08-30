import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const map = path.join(root, "README.md");
const linksFrom = (file) => [...readFileSync(file, "utf8").matchAll(/\[[^\]]+\]\(([^)#]+\.md)/g)]
  .map((match) => path.resolve(path.dirname(file), match[1]));

test("architecture uses one strict three-layer hierarchy", () => {
  const boardReadmes = linksFrom(map).filter((file) => path.basename(file) === "README.md");
  const boardDirectories = boardReadmes.map((file) => path.dirname(file)).toSorted();
  const actualDirectories = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name))
    .toSorted();
  assert.deepEqual(actualDirectories, boardDirectories);

  const details = [];
  for (const board of boardReadmes) {
    const targets = linksFrom(board);
    const owned = targets.filter((file) => path.dirname(file) === path.dirname(board) && file !== board);
    assert.ok(owned.length, `${board} does not link to a detail document`);
    assert.equal(targets.every((file) => file === map || owned.includes(file)), true);
    details.push(...owned);
  }

  const expected = new Set([map, ...boardReadmes, ...details]);
  const markdown = readdirSync(root, { recursive: true })
    .filter((name) => name.endsWith(".md"))
    .map((name) => path.join(root, name));
  assert.deepEqual(new Set(markdown), expected);
  for (const file of expected) {
    for (const target of linksFrom(file)) assert.equal(existsSync(target), true, `${file} links to missing file`);
  }
});
