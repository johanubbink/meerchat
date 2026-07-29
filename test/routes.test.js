/* Routing behavior: every reply announces a well-formed provenance route in
   mem.lastRoute, and the headline paths land where v12 lands them. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadBrain, textOf, drive } = require("./helpers");

const GRAMMAR = new RegExp(
  "^(regex:\\w+|fuzzy-(strong|weak):\\w+:\\d\\.\\d{3}|keyword:\\w+" +
  "|cont:(more|again):\\w+|cont:(generic|noctx)|namecapture|eliza:name" +
  "|eliza:\\d+|ack|callback|clarify:(q|huh|stmt|neg|pos)|pool:chat)$",
);

/* a scripted conversation that walks scenarios, continuations, answers,
   statements, OOD questions and gibberish — phrasings are deliberately not
   the brain's prototype sentences */
const SCRIPT = [
  "howzit", "quite good thanks", "what should I call you", "tell me a joke",
  "another one", "why", "where do you stay", "sounds dry out there",
  "what do you eat for breakfast", "gross man", "do you have family around",
  "that's a big family hey", "what is the capital of france", "ok",
  "my day was long and the traffic was terrible", "tell me a riddle",
  "again", "what time is it", "already morning here too", "sing something for me",
  "hahaha nice one", "are you scared of anything", "eagles sound rough",
  "how do magnets work", "fair enough", "what sport do you follow",
  "i also like running", "xqzt frpl vmm", "sorry keyboard slipped",
  "do you sleep at night", "must be cosy underground", "what music do you like",
  "i prefer jazz myself", "can you keep a secret", "tell me more",
  "what colour do you like best", "orange is nice ja", "who made you",
  "interesting", "is it hot there today", "here it is raining a lot",
  "do you know any facts", "another one please", "no ways",
  "what do you do for fun", "standing around all day sounds boring",
  "i am feeling a bit stressed today", "work is just a lot right now",
  "thanks for listening", "are you a robot or what", "knew it",
  "what languages can you speak", "afrikaans is lekker", "serious",
  "my sister got a new dog yesterday", "it keeps chewing her shoes",
  "anyway what were we saying", "got any advice for me", "that helps actually",
  "sharp sharp",
];

test("route is always set and matches the v12 grammar", async () => {
  const log = await drive(loadBrain(42), SCRIPT);
  for (const turn of log) {
    assert.ok(turn.route, `no route for "${turn.u}"`);
    assert.match(turn.route, GRAMMAR, `bad route "${turn.route}" for "${turn.u}"`);
  }
});

test("a first-message greeting lands on the greeting scenario", async () => {
  const b = loadBrain(1);
  await b.pickReply("howzit");
  assert.equal(b.mem.lastRoute, "regex:greetscen");
});

test("the fallback chat pool contains no greetings or goodbyes", async () => {
  const b = loadBrain(2);
  /* drain one full shuffle-bag rotation = every pool line exactly once */
  for (let i = 0; i < b.R_CHAT.length; i++) {
    const line = textOf(b.bagPick("purity", b.R_CHAT));
    assert.doesNotMatch(line, /\b(howzit|hello|good (morning|evening)|welcome back|totsiens|goodbye|bye now|see you|go well)\b/i, line);
  }
});

test("out-of-domain questions clarify instead of faking a scenario answer", async () => {
  for (const q of ["how do magnets work", "what is the capital of france",
                   "what is 12 times 12", "who won the world cup"]) {
    const b = loadBrain(3);
    await b.pickReply(q);
    assert.match(b.mem.lastRoute, /^clarify:/, q);
  }
});

test("gibberish gets the say-that-again treatment", async () => {
  const b = loadBrain(4);
  await b.pickReply("xqzt frpl vmm");
  assert.equal(b.mem.lastRoute, "clarify:huh");
});

test("continuations stay on the joke topic: more, more, then a fresh answer", async () => {
  const b = loadBrain(5);
  await b.pickReply("tell me a joke");
  assert.match(b.mem.lastRoute, /^(regex|fuzzy-strong|keyword):joke$|^fuzzy-strong:joke:\d\.\d{3}$/);
  await b.pickReply("another one");
  assert.equal(b.mem.lastRoute, "cont:more:joke");
  await b.pickReply("another one");
  assert.equal(b.mem.lastRoute, "cont:more:joke");
  await b.pickReply("another one");
  assert.equal(b.mem.lastRoute, "cont:again:joke");
});
