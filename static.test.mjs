import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const html = await readFile(new URL("index.html", `${root}/`), "utf8");
const js = await readFile(new URL("app.js", `${root}/`), "utf8");

test("HTML IDs are unique", () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test("every literal ID queried by application code exists", () => {
  const queried = [...js.matchAll(/\$\("#([A-Za-z0-9_-]+)"\)/g)].map(match => match[1]);
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  const missing = [...new Set(queried)].filter(id => !ids.has(id) && !js.includes(`id="${id}"`));
  assert.deepEqual(missing, []);
});

test("all five product views and accessible canvas labels are present", () => {
  for (const view of ["overview", "scenarios", "workforce", "variance", "memos"]) assert.match(html, new RegExp(`id="${view}-view"`));
  assert.equal((html.match(/<canvas[^>]+aria-label=/g) || []).length, 3);
});

test("finished site contains no starter or placeholder copy", () => {
  assert.doesNotMatch(html, /lorem ipsum|coming soon|hello world|todo/i);
});
