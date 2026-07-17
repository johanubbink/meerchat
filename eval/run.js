#!/usr/bin/env node
/* MeerChat evaluation runner.

   Simulates N seeded conversations of M messages against the production
   brain and scores every response deterministically.

   Usage: node eval/run.js [--convs 100] [--msgs 100] [--seed 12345]
                           [--out eval/results/<name>.json]
                           [--transcripts K]   dump K sample transcripts (.txt)
*/
"use strict";
const fs = require("fs");
const path = require("path");
const loadBrain = require("./lib/loadBrain");
const { makeSimulator } = require("./lib/simulator");
const { scoreResponse, normalizeReply, aggregate, parseRoute } = require("./lib/metrics");

const args = {};
for (let i = 2; i < process.argv.length; i += 2)
  args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];

const CONVS = +(args.convs || 100);
const MSGS = +(args.msgs || 100);
const SEED = +(args.seed || 12345);
const TRANSCRIPTS = +(args.transcripts || 0);

const bank = JSON.parse(
  fs.readFileSync(path.join(__dirname, "data", "bank.json"), "utf8"));

async function runConversation(ci) {
  const brain = loadBrain(SEED * 7919 + ci);
  const rng = loadBrain.mulberry32(SEED * 104729 + ci * 31);
  const sim = makeSimulator(rng, bank, { msgs: MSGS });
  const records = [];
  const seenReplies = new Set();
  let lastBot = null;

  for (let mi = 0; mi < MSGS; mi++) {
    const turn = sim.next(lastBot);
    const reply = await brain.pickReply(turn.t);
    const route = brain.mem.lastRoute || null;
    lastBot = reply;

    const ctx = { onTopic: turn.onTopic || null };
    if (turn.label === "namegive")
      ctx.nameStored = brain.mem.name === turn.name;
    if (turn.label === "myname")
      ctx.nameRecalled = turn.name ? reply.includes(turn.name) : false;

    const rec = {
      conv: ci, i: mi, u: turn.t, a: reply, route,
      label: turn.label, acceptable: turn.acceptable || [], ctx,
    };
    rec.score = scoreResponse(rec);
    const norm = normalizeReply(reply);
    rec.repeated = seenReplies.has(norm);
    seenReplies.add(norm);
    rec.finalScore = rec.repeated ? rec.score * 0.3 : rec.score;
    records.push(rec);
  }
  return records;
}

(async () => {
  const t0 = process.hrtime.bigint();
  const all = [];
  const perConv = [];
  for (let ci = 0; ci < CONVS; ci++) {
    const recs = await runConversation(ci);
    all.push(...recs);
    perConv.push(aggregate(recs).overall);
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;

  const summary = aggregate(all);
  summary.convs = CONVS;
  summary.msgsPerConv = MSGS;
  summary.seed = SEED;
  summary.convScoreMin = Math.min(...perConv);
  summary.convScoreMax = Math.max(...perConv);
  summary.runtimeMs = Math.round(ms);

  /* route distribution for diagnostics */
  const routes = {};
  for (const r of all) {
    const t = parseRoute(r.route).type;
    routes[t] = (routes[t] || 0) + 1;
  }
  summary.routeShare = Object.fromEntries(
    Object.entries(routes).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => [k, Math.round((v / all.length) * 1000) / 10]));

  console.log(JSON.stringify(summary, null, 2));

  if (args.out) {
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, JSON.stringify({ summary, records: all }));
    console.error("wrote " + args.out);
  }
  if (TRANSCRIPTS > 0) {
    const dir = path.join(__dirname, "results", "transcripts");
    fs.mkdirSync(dir, { recursive: true });
    for (let ci = 0; ci < Math.min(TRANSCRIPTS, CONVS); ci++) {
      const recs = all.filter((r) => r.conv === ci);
      const lines = recs.flatMap((r) => [
        `USER: ${r.u}`,
        `TSAMMA: ${r.a}`,
        `   [${r.label} -> ${r.route} | score ${r.finalScore.toFixed(2)}]`, ""]);
      fs.writeFileSync(path.join(dir, `conv${ci}.txt`), lines.join("\n"));
    }
    console.error(`wrote ${Math.min(TRANSCRIPTS, CONVS)} transcripts to ${dir}`);
  }
})();
