/* The shared clever-brain prompt code (js/llmShared.js): loadable both as a
   Node module and as a classic browser script, and its sanitizer catches
   what it must catch. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { PERSONA, memoryNote, groundingNote, buildMessages, sanitize } =
  require("../js/llmShared");

test("sanitize strips model artifacts and passes clean text", () => {
  assert.equal(sanitize("<think>hmm</think>Howzit boet", "fb", []), "Howzit boet");
  assert.equal(sanitize('"Lekker day today"', "fb", []), "Lekker day today");
  assert.equal(sanitize("Tsamma: all quiet here", "fb", []), "all quiet here");
  assert.equal(sanitize("*flicks tail* The dune is calm", "fb", []), "The dune is calm");
});

test("sanitize falls back on empty, banned or role-leaking output", () => {
  assert.equal(sanitize(null, "fb", []), "fb");
  assert.equal(sanitize('""', "fb", []), "fb");
  assert.equal(sanitize("I am an AI assistant, actually", "fb", []), "fb");
  assert.equal(sanitize("sure! USER: now say something", "fb", []), "fb");
});

test("sanitize falls back on an exact repeat of the previous reply", () => {
  const hist = [{ u: "hi", a: "Howzit, all quiet on the mound." }];
  assert.equal(sanitize("Howzit, all quiet on the mound.", "fb", hist), "fb");
  assert.equal(sanitize("Howzit, all quiet on the mound.", "fb", []), "Howzit, all quiet on the mound.");
});

test("sanitize cuts runaway output at a sentence boundary", () => {
  const long = ("The dune is long and the sun is high. ").repeat(20);
  const s = sanitize(long, "fb", []);
  assert.ok(s.length <= 400, String(s.length));
  assert.match(s, /[.!?]$/);
});

test("buildMessages: system prompt first, history interleaved, user text last", () => {
  const mem = { name: "Thabo", topics: ["his new dog"] };
  const hist = [{ u: "howzit", a: "Howzit!" }];
  const msgs = buildMessages("tell me a joke", "scripted joke", "fuzzy-strong:joke:0.900", mem, hist);
  assert.equal(msgs.length, 4);
  assert.equal(msgs[0].role, "system");
  assert.ok(msgs[0].content.startsWith(PERSONA));
  assert.ok(msgs[0].content.includes(memoryNote(mem)));
  assert.ok(msgs[0].content.includes(groundingNote("fuzzy-strong:joke:0.900", "scripted joke")));
  assert.deepEqual(msgs.slice(1).map((m) => m.role), ["user", "assistant", "user"]);
  assert.equal(msgs[3].content, "tell me a joke");
});

test("memoryNote reflects what the brain knows", () => {
  assert.match(memoryNote({ name: null, topics: [] }), /don't know the person's name/);
  const note = memoryNote({ name: "Lerato", topics: ["rugby", "the drought"] });
  assert.match(note, /Lerato/);
  assert.match(note, /rugby; the drought/);
});

test("groundingNote picks the right instruction per route class", () => {
  assert.match(groundingNote("clarify:q", "x"), /no good match/);
  assert.match(groundingNote("pool:chat", "x"), /no good match/);
  assert.match(groundingNote("cont:more:joke", "x"), /continue/i);
  assert.match(groundingNote("regex:joke", "x"), /prepared material/);
  assert.match(groundingNote("regex:home", "x"), /say it your own way/);
});
