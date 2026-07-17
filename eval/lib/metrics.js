/* Deterministic per-response scoring.

   Each response gets a quality score in [0,1] from (message label, route
   that produced the reply, conversation context). The rubric rewards
   answering the right scenario, handling reactive/continuation turns in
   context, and graceful behavior on out-of-domain input; it punishes
   confidently-wrong scenario answers and random pool junk.

   The rubric is FROZEN across brain versions (it already knows about the
   "clarify" route that later versions may add) so before/after numbers
   are comparable. */
"use strict";

function parseRoute(route) {
  if (!route) return { type: "none", id: null };
  const p = route.split(":");
  switch (p[0]) {
    case "regex": case "keyword": return { type: "scenario", id: p[1], via: p[0] };
    case "fuzzy-strong": case "fuzzy-weak":
      return { type: "scenario", id: p[1], via: p[0], score: +p[2] };
    case "cont": return { type: "cont", sub: p[1], id: p[2] || null };
    case "eliza": return p[1] === "name"
      ? { type: "namecapture" } : { type: "eliza", id: p[1] };
    case "namecapture": return { type: "namecapture" };
    case "ack": return { type: "ack" };
    case "callback": return { type: "callback" };
    case "clarify": return { type: "clarify" };
    case "pool": return { type: "pool", cat: p[1] };
    default: return { type: p[0], id: p[1] || null };
  }
}

/* pool categories that at least match the vibe of some intents */
const POOL_CAT_OK = {
  greetscen: "greet", byescen: "bye", howru: "greet",
  weather: "weather", userfood: "food", eats: "food", danger: "danger",
};

function scoreResponse(rec) {
  const { label, acceptable = [], route, ctx = {} } = rec;
  const r = parseRoute(route);

  switch (label) {
    case "intent": {
      if (r.type === "scenario")
        return acceptable.includes(r.id) ? 1.0 : 0.1;
      if (r.type === "cont" && r.id && acceptable.includes(r.id)) return 0.9;
      if (r.type === "eliza") return 0.45;
      if (r.type === "clarify") return 0.35;
      if (r.type === "ack") return 0.35;
      if (r.type === "callback") return 0.3;
      if (r.type === "cont") return 0.25;
      if (r.type === "pool")
        return acceptable.some((id) => POOL_CAT_OK[id] === r.cat) ? 0.35 : 0.15;
      return 0.2;
    }
    case "reactive": {
      if (r.type === "ack") return 1.0;
      if (r.type === "eliza") return 0.85;
      if (r.type === "scenario")
        return acceptable.includes(r.id) ? 0.9 : 0.2;
      if (r.type === "callback") return 0.6;
      if (r.type === "cont") return 0.4;
      if (r.type === "clarify") return 0.3;
      if (r.type === "pool") return 0.3;
      return 0.25;
    }
    case "continuation": {
      if (r.type === "cont" && (r.sub === "more" || r.sub === "again")) return 1.0;
      if (r.type === "cont") return 0.7; /* generic but on-topic-ish */
      if (r.type === "scenario" && ctx.onTopic && r.id === ctx.onTopic) return 0.8;
      if (r.type === "ack") return 0.5;
      if (r.type === "eliza") return 0.3;
      if (r.type === "scenario") return 0.3;
      if (r.type === "clarify") return 0.25;
      if (r.type === "pool") return 0.15;
      return 0.2;
    }
    case "smalltalk": {
      if (r.type === "scenario")
        return acceptable.includes(r.id) ? 1.0 : 0.2;
      if (r.type === "eliza") return 0.85;
      if (r.type === "ack") return 0.7;
      if (r.type === "callback") return 0.6;
      if (r.type === "clarify") return 0.4;
      if (r.type === "pool") return 0.3;
      return 0.25;
    }
    case "ood": {
      if (r.type === "clarify") return 1.0;
      if (r.type === "eliza") return 0.7;
      if (r.type === "callback") return 0.55;
      if (r.type === "ack") return 0.5;
      if (r.type === "pool") return 0.4;
      if (r.type === "cont") return 0.3;
      if (r.type === "scenario") return 0.1; /* pretending to know */
      return 0.2;
    }
    case "namegive": {
      /* route must capture the name AND store it correctly */
      if (r.type !== "namecapture") return 0.0;
      return ctx.nameStored ? 1.0 : 0.3;
    }
    case "myname": {
      return ctx.nameRecalled ? 1.0 : 0.0;
    }
    default:
      return 0.5;
  }
}

function normalizeReply(s) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

/* aggregate a list of per-message records into headline metrics */
function aggregate(records) {
  const by = (f) => records.filter(f);
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const pct = (x) => Math.round(x * 1000) / 10;

  const intents = by((r) => r.label === "intent");
  const intentHit = intents.filter((r) => {
    const p = parseRoute(r.route);
    return p.type === "scenario" && r.acceptable.includes(p.id);
  });
  const ood = by((r) => r.label === "ood");
  const oodMisfire = ood.filter((r) => parseRoute(r.route).type === "scenario");
  const reactive = by((r) => r.label === "reactive");
  const reactiveGood = reactive.filter((r) => r.score >= 0.85);
  const conts = by((r) => r.label === "continuation");
  const contGood = conts.filter((r) => r.score >= 0.7);
  const names = by((r) => r.label === "namegive");
  const nameOk = names.filter((r) => r.score >= 1.0);
  const mynames = by((r) => r.label === "myname");
  const mynameOk = mynames.filter((r) => r.score >= 1.0);
  const pool = records.filter((r) => parseRoute(r.route).type === "pool");
  const repeated = records.filter((r) => r.repeated);

  return {
    n: records.length,
    overall: pct(mean(records.map((r) => r.finalScore))),
    intentAccuracy: pct(intentHit.length / (intents.length || 1)),
    intentN: intents.length,
    oodMisfireRate: pct(oodMisfire.length / (ood.length || 1)),
    oodScore: pct(mean(ood.map((r) => r.finalScore))),
    oodN: ood.length,
    reactiveGoodRate: pct(reactiveGood.length / (reactive.length || 1)),
    reactiveN: reactive.length,
    continuationGoodRate: pct(contGood.length / (conts.length || 1)),
    continuationN: conts.length,
    nameCaptureRate: pct(nameOk.length / (names.length || 1)),
    nameN: names.length,
    nameRecallRate: pct(mynameOk.length / (mynames.length || 1)),
    nameRecallN: mynames.length,
    junkPoolRate: pct(pool.length / records.length),
    repetitionRate: pct(repeated.length / records.length),
  };
}

module.exports = { scoreResponse, parseRoute, normalizeReply, aggregate };
