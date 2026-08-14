import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("the static page loads CSS through HTML instead of a browser JavaScript import", () => {
  const html = read("index.html");
  const main = read("src/main.js");

  assert.match(html, /<link rel="stylesheet" href="\/src\/styles\.css"/);
  assert.doesNotMatch(main, /import\s+["']\.\/styles\.css["']/);
  assert.doesNotMatch(main, /createLiveEvidencePlaceholder/);
});
