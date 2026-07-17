/* Load the production brain (js/brain.js + data) into a sandboxed vm context
   with a seeded RNG and a fixed clock, so runs are fully reproducible.
   Returns a fresh, isolated brain instance (own mem/bags) per call. */
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");

/* mulberry32: tiny seeded PRNG, plenty good for shuffle bags */
function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* fixed clock: Wednesday 2026-01-14 10:00 local (morning) */
const FIXED = [2026, 0, 14, 10, 0, 0];
class FakeDate extends Date {
  constructor(...a) {
    if (a.length === 0) super(...FIXED);
    else super(...a);
  }
  static now() { return new Date(...FIXED).getTime(); }
}

let compiled = null;
function compile() {
  const src =
    fs.readFileSync(path.join(ROOT, "js/data/responses.js"), "utf8") +
    fs.readFileSync(path.join(ROOT, "js/data/protos.js"), "utf8") +
    fs.readFileSync(path.join(ROOT, "js/brain.js"), "utf8") +
    ';__exports = { pickReply, mem, SCEN, PROTO, toks, fuzzyHit, TH, tune };';
  compiled = new vm.Script(src, { filename: "brain-under-test.js" });
  return compiled;
}

function loadBrain(seed) {
  if (!compiled) compile();
  const ctx = {
    console,
    Math: Object.assign(Object.create(Math), { random: mulberry32(seed) }),
    Date: FakeDate,
    __exports: null,
  };
  vm.createContext(ctx);
  compiled.runInContext(ctx);
  /* optional threshold tuning, e.g. MEER_TUNE="0.55,0.4" (strong,weak) */
  if (process.env.MEER_TUNE) {
    const [s, k] = process.env.MEER_TUNE.split(",").map(Number);
    ctx.__exports.tune(s, k);
  }
  return ctx.__exports;
}

/* invalidate the compiled script (used when comparing code variants) */
loadBrain.reload = () => { compiled = null; };
loadBrain.mulberry32 = mulberry32;
module.exports = loadBrain;
