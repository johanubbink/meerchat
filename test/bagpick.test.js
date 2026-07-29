/* Shuffle bags: every pool is exhausted in random order before any repeat,
   and refills never produce a back-to-back duplicate. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadBrain } = require("./helpers");

const POOL = ["one", "two", "three", "four", "five"];

test("a full rotation is a permutation of the pool", () => {
  for (let seed = 1; seed <= 10; seed++) {
    const b = loadBrain(seed);
    const drawn = POOL.map(() => b.bagPick("perm", POOL));
    assert.deepEqual([...drawn].sort(), [...POOL].sort(), `seed ${seed}`);
  }
});

test("100 draws never repeat back-to-back", () => {
  for (let seed = 1; seed <= 10; seed++) {
    const b = loadBrain(seed);
    let prev = null;
    for (let i = 0; i < 100; i++) {
      const d = b.bagPick("noreps", POOL);
      assert.notEqual(d, prev, `seed ${seed}, draw ${i}`);
      prev = d;
    }
  }
});

test("a one-line pool just returns that line", () => {
  const b = loadBrain(30);
  for (let i = 0; i < 3; i++) assert.equal(b.bagPick("single", ["only"]), "only");
});
