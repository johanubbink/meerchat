/* Hard-constraint guards, checked against the sources as text.
   These pin the rules in CLAUDE.md: brain.js stays vm-loadable, js/ stays
   classic-script only, and index.html never loads the LLM layer. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { ROOT, read, jsFiles } = require("./helpers");

test("brain.js touches window only in the export guard", () => {
  const src = read("js/brain.js");
  assert.equal(src.match(/typeof window/g).length, 1);
  assert.equal(src.match(/\bwindow\s*[.[]/g).length, 1);
  assert.match(src, /window\.__meer\s*=/);
  assert.equal(src.match(/\bdocument\s*[.[]/g), null);
});

test("no import/export module syntax anywhere under js/", () => {
  for (const f of jsFiles(path.join(ROOT, "js"))) {
    const src = read(path.relative(ROOT, f));
    assert.doesNotMatch(src, /^\s*import\s/m, f);
    assert.doesNotMatch(src, /^\s*export\s+(default|const|let|var|function|class|\{)/m, f);
  }
});

test("index.html loads exactly the expected scripts — and never the LLM layer", () => {
  const html = read("index.html");
  const tags = [...html.matchAll(/<script src="([^"?]+)(?:\?v=([\d.]+))?"><\/script>/g)];
  assert.deepEqual(
    tags.map((m) => m[1]),
    ["js/data/frames.js", "js/data/sprites.js", "js/data/responses.js", "js/data/protos.js", "js/brain.js", "js/scene.js", "js/ui.js"],
  );
  /* the LLM layer must not load (and download a model) on page open */
  for (const m of tags) assert.doesNotMatch(m[1], /llm/i);
});

test("every ?v= tag equals VERSION in brain.js", () => {
  const version = read("js/brain.js").match(/const VERSION = "v([\d.]+)"/)[1];
  const tags = [...read("index.html").matchAll(/<script src="[^"?]+\?v=([\d.]+)"><\/script>/g)];
  assert.equal(tags.length, 7);
  for (const m of tags) assert.equal(m[1], version);
});
