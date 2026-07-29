/* Name capture and recall: the awaitName window, the vocabulary gate, and
   the stored name coming back verbatim. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadBrain } = require("./helpers");

test("an explicit introduction is captured and stored", async () => {
  const b = loadBrain(11);
  await b.pickReply("my name is Thabo");
  assert.equal(b.mem.lastRoute, "namecapture");
  assert.equal(b.mem.name, "Thabo");
  assert.equal(b.mem.awaitName, 0);
});

test("an in-vocabulary word is never mistaken for a name", async () => {
  const b = loadBrain(12);
  await b.pickReply("busy");
  assert.notEqual(b.mem.lastRoute, "namecapture");
  assert.equal(b.mem.name, null);
});

test("a bare out-of-vocabulary word counts as an answer to the opening question", async () => {
  const b = loadBrain(13);
  await b.pickReply("Thabo");
  assert.equal(b.mem.lastRoute, "namecapture");
  assert.equal(b.mem.name, "Thabo");
});

test("the capture window closes after three non-question turns", async () => {
  const b = loadBrain(14);
  for (const m of ["busy", "just chilling here", "same old same old"])
    await b.pickReply(m);
  assert.equal(b.mem.awaitName, 0);
  await b.pickReply("Thabo");
  assert.notEqual(b.mem.lastRoute, "namecapture");
  assert.equal(b.mem.name, null);
});

test("recall: the stored name comes back in the reply", async () => {
  const b = loadBrain(15);
  await b.pickReply("my name is Thabo");
  const r = await b.pickReply("what is my name");
  assert.equal(b.mem.lastRoute, "regex:myname");
  assert.ok(r.includes("Thabo"), r);
});
