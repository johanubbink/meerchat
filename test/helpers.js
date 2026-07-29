/* Shared fixtures for the unit tests. The brain is loaded through the same
   sandbox the eval harness uses (seeded RNG, fixed clock: Wed 2026-01-14
   10:00), so every test run is fully deterministic. */
"use strict";
/* a MEER_TUNE left in the environment would silently shift thresholds */
delete process.env.MEER_TUNE;

const fs = require("fs");
const path = require("path");
const loadBrain = require("../eval/lib/loadBrain");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

/* pool entries are {c,t} objects today; keep tests working if they
   ever become plain strings */
const textOf = (e) => (e && e.t !== undefined ? e.t : e);

/* run a scripted conversation, recording state after every turn */
async function drive(brain, msgs) {
  const log = [];
  for (const m of msgs) {
    const a = await brain.pickReply(m);
    log.push({ u: m, a, route: brain.mem.lastRoute, pending: brain.mem.pending });
  }
  return log;
}

/* list every .js file under a directory, recursively */
function jsFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...jsFiles(p));
    else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}

module.exports = { loadBrain, ROOT, read, textOf, drive, jsFiles };
