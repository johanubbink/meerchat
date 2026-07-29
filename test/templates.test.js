/* Placeholder filling and tuned constants. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadBrain, drive } = require("./helpers");

const CHATTER = [
  "howzit", "lekker thanks", "tell me a joke", "another one", "again",
  "what should I call you", "Lerato", "what day is it", "already morning here",
  "where do you stay", "must be quiet there", "tell me a fact", "more",
  "what do you eat", "rather you than me hey", "sing something",
  "hahaha", "do you have friends", "sounds like a good crew",
  "my neighbour plays drums at midnight", "ja every single night",
  "what is the capital of italy", "ok fair", "are you a robot",
  "thought so", "do you dream", "deep stuff for a meerkat",
  "what music do you like", "i like jazz", "sharp sharp",
];

test("no reply ever leaks a literal template token", async () => {
  const log = await drive(loadBrain(31), CHATTER);
  for (const turn of log)
    assert.doesNotMatch(turn.a, /\{(W|TOD|DAY)\}/, `"${turn.u}" -> "${turn.a}"`);
});

test("the fixed eval clock reads Wednesday morning", async () => {
  const b = loadBrain(32);
  const r = await b.pickReply("what day is it");
  assert.equal(b.mem.lastRoute, "regex:datetime");
  assert.ok(r.includes("Wednesday"), r);
  assert.ok(r.includes("morning"), r);
});

test("classifier thresholds are the eval-calibrated pair", () => {
  const b = loadBrain(33);
  assert.deepEqual({ ...b.TH }, { strong: 0.58, weak: 0.42 });
});
