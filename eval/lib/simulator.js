/* Seeded user simulator: emits one message at a time, reacting to the bot's
   previous reply (answers her questions, follows up on stories/jokes).
   Every message carries a ground-truth label so scoring is deterministic.

   Labels:
     intent      — user asks/says something matching a scenario (acceptable ids)
     reactive    — user answers a question the bot just asked
     continuation— short follow-up that continues the bot's last topic
     smalltalk   — statement about the user's life (acceptable ids may be empty)
     ood         — out-of-domain: bot has no scripted knowledge for this
     namegive    — user states their name
     myname      — user asks the bot to recall their name
*/
"use strict";

const NAMES = ["Douw", "Sannie", "Pieter", "Thabo", "Lerato", "Anika",
  "Johan", "Zanele", "Kobus", "Nandi", "Riaan", "Precious", "Dawie",
  "Busi", "Hennie", "Karabo", "Elna", "Sipho", "Marike", "Tumi"];

/* intents that plausibly invite a follow-up continuation */
const CONTINUABLE = new Set(["joke", "story", "riddle", "fact", "secret",
  "sing", "news", "lifestory", "dream", "jackal", "fear"]);

function makeShuffledCycler(rng, arr) {
  let order = [], i = 0;
  const reshuffle = () => {
    order = arr.map((_, k) => k);
    for (let j = order.length - 1; j > 0; j--) {
      const k = Math.floor(rng() * (j + 1));
      [order[j], order[k]] = [order[k], order[j]];
    }
    i = 0;
  };
  reshuffle();
  return () => {
    if (i >= order.length) reshuffle();
    return arr[order[i++]];
  };
}

function makeSimulator(rng, bank, opts = {}) {
  const name = NAMES[Math.floor(rng() * NAMES.length)];
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  /* per-conversation cyclers so we don't repeat the same phrasing.
     greetscen/byescen are excluded from the main rotation: greetings are
     the opening move and a mid-chat "bye" would falsely end the flow. */
  const mainIntents = bank.intents.filter(
    (x) => x.id !== "greetscen" && x.id !== "byescen");
  const intentCycler = makeShuffledCycler(rng, mainIntents);
  const perIntentMsg = new Map();
  const msgOf = (intent) => {
    if (!perIntentMsg.has(intent.id))
      perIntentMsg.set(intent.id, makeShuffledCycler(rng, intent.messages));
    return perIntentMsg.get(intent.id)();
  };
  const oodMsg = makeShuffledCycler(rng, bank.ood);
  const reactMsg = makeShuffledCycler(rng, bank.reactive.reactiveAnswers);
  const contMsg = makeShuffledCycler(rng, bank.reactive.continuations);
  const smallMsg = makeShuffledCycler(rng, bank.reactive.smalltalk);

  let step = 0;
  let lastIntentAsked = null;   // id of last scenario question we asked
  let gaveName = false;
  let askedMyName = false;
  let total = opts.msgs || 100;

  /* opening style: A greet-then-name, B name-first, C greet-and-ignore */
  const opening = rng() < 0.4 ? "A" : rng() < 0.45 ? "B" : "C";

  function intentTurn() {
    const it = intentCycler();
    lastIntentAsked = it.id;
    return { t: msgOf(it), label: "intent",
             acceptable: [it.id, ...(it.acceptable || [])] };
  }

  function next(lastBotReply) {
    step++;
    const last = step >= total;
    const secondToLast = step === total - 1;

    /* fixed closing: thanks, then bye */
    if (last) {
      const it = bank.intents.find((x) => x.id === "byescen");
      lastIntentAsked = "byescen";
      return { t: msgOf(it), label: "intent", acceptable: ["byescen"] };
    }
    if (secondToLast) {
      const it = bank.intents.find((x) => x.id === "thanks");
      lastIntentAsked = "thanks";
      return { t: msgOf(it), label: "intent", acceptable: ["thanks"] };
    }

    /* opening moves */
    if (step === 1) {
      if (opening === "B") {
        gaveName = true;
        return { t: pick(bank.reactive.namegive).replace("NAME", name),
                 label: "namegive", name };
      }
      const it = bank.intents.find((x) => x.id === "greetscen");
      lastIntentAsked = "greetscen";
      return { t: msgOf(it), label: "intent",
               acceptable: ["greetscen", "howru"] };
    }
    if (step === 2 && opening === "A") {
      gaveName = true;
      return { t: pick(bank.reactive.namegive).replace("NAME", name),
               label: "namegive", name };
    }

    const botAsked = /\?\s*$/.test(lastBotReply || "");

    /* she asked us something: usually answer it */
    if (botAsked && rng() < 0.7) {
      lastIntentAsked = null;
      return { t: reactMsg(), label: "reactive" };
    }

    /* follow up on stories/jokes/etc. */
    if (lastIntentAsked && CONTINUABLE.has(lastIntentAsked) && rng() < 0.5) {
      const onTopic = lastIntentAsked;
      lastIntentAsked = null;
      return { t: contMsg(), label: "continuation", onTopic };
    }

    /* late-conversation memory check, once */
    if (!askedMyName && gaveName && step > total * 0.5 && rng() < 0.08) {
      askedMyName = true;
      const it = bank.intents.find((x) => x.id === "myname");
      lastIntentAsked = "myname";
      return { t: msgOf(it), label: "myname", name };
    }

    /* main distribution */
    const r = rng();
    if (r < 0.55) return intentTurn();
    if (r < 0.72) {
      lastIntentAsked = null;
      const s = smallMsg();
      return { t: s.t, label: "smalltalk", acceptable: s.acceptable || [] };
    }
    lastIntentAsked = null;
    return { t: oodMsg(), label: "ood" };
  }

  return { next, name, opening };
}

module.exports = { makeSimulator, NAMES };
