/* Dialogue state: the pending-question flag, the ack path, and the memory
   caps that keep mem small over long conversations. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadBrain, drive } = require("./helpers");

const CHATTER = [
  "howzit", "good thanks and you", "what should I call you", "Pieter",
  "tell me a joke", "another one", "where do you stay", "sounds far away",
  "my car broke down this morning", "the mechanic says it is the clutch",
  "what do you eat", "rather you than me", "do you sleep at night",
  "what is the capital of spain", "ok fine", "tell me a story",
  "more please", "that was actually good", "what colour do you like",
  "blue is better", "do you follow sport", "i watch rugby on weekends",
  "my boss is driving me crazy lately", "ja it is a lot",
  "what day is it", "feels like friday honestly", "sing for me",
  "hahaha", "are you real", "fair enough hey",
];

test("a reply that ends on a question always raises the pending flag", async () => {
  const log = await drive(loadBrain(21), CHATTER);
  for (const turn of log)
    if (/\?\s*$/.test(turn.a))
      assert.equal(turn.pending, true, `pending not set after "${turn.a}"`);
});

test("a plain scenario answer lowers the pending flag", async () => {
  const b = loadBrain(22);
  const r = await b.pickReply("tell me a joke");   // joke: no asks, no recip
  if (!/\?\s*$/.test(r)) assert.equal(b.mem.pending, false);
});

test("a short answer to her question is acknowledged, not pooled", async () => {
  const b = loadBrain(23);
  const r = await b.pickReply("how are you");
  assert.match(r, /\?\s*$/);
  await b.pickReply("quite good thanks");
  assert.equal(b.mem.lastRoute, "ack");
});

test("history stays capped at 8 and topics at 3 over a long run", async () => {
  const b = loadBrain(24);
  for (const m of CHATTER) {
    await b.pickReply(m);
    assert.ok(b.mem.history.length <= 8);
    assert.ok(b.mem.topics.length <= 3);
  }
  assert.equal(b.mem.history.length, 8);
  for (const h of b.mem.history) {
    assert.ok("u" in h && "a" in h && "route" in h);
  }
});
