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
  assert.match(main, /Publish Redline on Coston2/);
  assert.doesNotMatch(main, /data-action="sign"/);
});

test("the shipped frontend copy is English-only", () => {
  for (const file of ["src/core.js", "src/main.js", "src/evidence.js", "index.html"]) {
    assert.doesNotMatch(read(file), /[\p{Script=Han}]/u, `${file} contains untranslated UI copy`);
  }
});
