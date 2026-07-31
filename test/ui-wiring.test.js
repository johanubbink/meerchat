/* End-to-end test of js/ui.js against a hand-rolled DOM stub: loads the
   real seven scripts in index.html's order into one vm context, types a
   message, and checks the chat → route → scene-action chain.
   This is the only test that runs ui.js, so it also guards the load order
   and the globals ui.js depends on (F, SPR, FD, __scene, pickReply, mem). */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { ROOT, read } = require("./helpers");

/* ---------- minimal DOM ---------- */
function mkEl(tag) {
  return {
    tagName: tag, id: "", className: "", style: {}, dataset: {},
    children: [], listeners: {}, _text: "",
    get textContent() { return this._text; },
    set textContent(v) { this._text = String(v); this.children = []; },
    appendChild(c) { this.children.push(c); return c; },
    remove() {},
    addEventListener(ev, fn) { (this.listeners[ev] ||= []).push(fn); },
    fire(ev, arg) { for (const fn of this.listeners[ev] || []) fn(arg || {}); },
    getBoundingClientRect() { return { width: this._text.length * 6.2 }; },
    get scrollHeight() { return 100; },
    scrollTop: 0,
  };
}

function mkDom() {
  const ids = {};
  for (const id of ["art", "cap", "chat", "inp", "send"]) {
    ids[id] = mkEl("div"); ids[id].id = id;
  }
  ids.inp.value = "";
  const body = mkEl("body");
  body.clientWidth = 980;
  ids.art.parentNode = body;
  return {
    document: {
      body,
      getElementById: (id) => ids[id] || null,
      createElement: mkEl,
      createTextNode: (t) => { const n = mkEl("#text"); n.textContent = t; return n; },
    },
    els: ids,
  };
}

/* a controllable clock: run() drains due timers in order */
function mkClock() {
  let now = 0, seq = 0;
  const q = [];
  return {
    now: () => now,
    setTimeout: (fn, ms) => { q.push({ at: now + (ms || 0), i: seq++, fn }); return q.length; },
    setInterval: (fn, ms) => { q.push({ at: now + (ms || 0), i: seq++, fn, every: ms }); return 0; },
    clearTimeout() {},
    clearInterval() {},
    /* advance virtual time, capping how many callbacks run so the
       self-rescheduling animation loop can't spin forever */
    async run(ms, maxSteps = 400) {
      const until = now + ms;
      for (let n = 0; n < maxSteps; n++) {
        q.sort((a, b) => a.at - b.at || a.i - b.i);
        const t = q.find((x) => x.at <= until);
        if (!t) break;
        q.splice(q.indexOf(t), 1);
        now = t.at;
        if (t.every) q.push({ at: now + t.every, i: seq++, fn: t.fn, every: t.every });
        await t.fn();
        await Promise.resolve();
      }
      now = until;
    },
  };
}

function boot({ reducedMotion = false, hour = 12, minute = 4 } = {}) {
  const dom = mkDom();
  const clock = mkClock();
  const win = {
    matchMedia: () => ({ matches: reducedMotion }),
    addEventListener() {},
    innerHeight: 760,
  };
  /* pin the wall clock to the virtual one: `new Date()` follows clock.run,
     so the sky phase, the night nap and the ambient events are all
     deterministic. 12:04 is a verified bird-free minute; 12:00 has a bird
     flyby (sec 8-24) and any evening hour lands in the night nap. */
  const t0 = new Date(2026, 0, 14, hour, minute, 0).getTime();
  const FakeDate = class extends Date {
    constructor(...a) { a.length ? super(...a) : super(t0 + clock.now()); }
    static now() { return t0 + clock.now(); }
  };
  const ctx = {
    window: win,
    document: dom.document,
    console: { warn() {}, log() {} },
    setTimeout: clock.setTimeout,
    setInterval: clock.setInterval,
    clearTimeout: clock.clearTimeout,
    clearInterval: clock.clearInterval,
    Date: FakeDate,
    Math: Object.assign(Object.create(Math), { random: () => 0.5 }),
  };
  win.window = win;
  vm.createContext(ctx);
  /* index.html's load order, read straight from the page so the test fails
     if the page and the engine ever disagree */
  const srcs = [...read("index.html").matchAll(/<script src="([^"?]+)/g)].map((m) => m[1]);
  assert.ok(srcs.includes("js/scene.js"), "index.html loads the scene engine");
  for (const s of srcs) {
    new vm.Script(fs.readFileSync(path.join(ROOT, s), "utf8"), { filename: s }).runInContext(ctx);
  }
  /* brain.js's `mem` and ui.js's `schedState` are top-level const/let, so
     they are lexical bindings rather than context properties — reachable
     only from inside the context. That ui.js can see `mem` at all is the
     mechanism under test here, so probe it the same way. */
  new vm.Script("globalThis.__probe = () => ({ mem, schedState, ROUTE_ACTIONS });")
    .runInContext(ctx);
  return { ctx, dom, clock, probe: () => ctx.__probe() };
}

test("ui boots: the scene paints, the caption and greeting land", async () => {
  const { ctx, dom, clock } = boot();
  await clock.run(50);
  const art = dom.els.art.textContent;
  assert.equal(art.split("\n").length, ctx.window.__scene.GRID.rows);
  assert.match(art, /\.{30,}/, "the dune line is drawn");
  assert.equal(dom.els.cap.textContent, ctx.window.__scene.IDLE_CAPTION);
  assert.equal(dom.document.body.dataset.phase.length > 0, true, "a sky phase is set");
  assert.equal(dom.els.chat.children.length, 1, "the greeting bubble is there");
  assert.match(dom.els.art.style.fontSize, /^[\d.]+px$/, "fitArt sized the art");
});

test("the idle animation advances through poses on its own", async () => {
  const { ctx, dom, clock } = boot();
  await clock.run(50);
  /* sample across a full idle lap rather than at two arbitrary instants:
     the loop returns to sentry repeatedly, so single samples are flaky */
  const arts = new Set(), caps = new Set();
  for (let t = 0; t < 10000; t += 150) {
    arts.add(dom.els.art.textContent);
    caps.add(dom.els.cap.textContent);
    await clock.run(150);
  }
  assert.ok(arts.size >= 4, `saw ${arts.size} distinct poses over one lap`);
  /* the captions the idle sequence is supposed to narrate */
  for (const want of ["checking left...", "checking right...", ctx.window.__scene.IDLE_CAPTION]) {
    assert.ok(caps.has(want), `caption "${want}" appeared`);
  }
});

test("asking for a dance makes the scene dance", async () => {
  const { ctx, dom, clock, probe } = boot();
  await clock.run(50);
  /* sample captions from the click onward — some of the new anims are
     shorter than the reply delay plus a coarse wait would allow */
  dom.els.inp.value = "dance for me";
  dom.els.send.fire("click");
  const shuffleSeen = [];
  for (let i = 0; i < 40; i++) { shuffleSeen.push(dom.els.cap.textContent); await clock.run(200); }
  /* the brain answered in character... */
  assert.ok(dom.els.chat.children.length >= 3, "user bubble + reply bubble were added");
  assert.match(probe().mem.lastRoute, /dance/, "the brain took the dance route");
  /* ...and the scene ran one of the dances: their captions are
     distinctive (Math.random is pinned to 0.5, so the pick is stable) */
  assert.ok(
    shuffleSeen.some((c) => /shuffle|hop|moonwalk|bounce|spin|flourish|ta-da/i.test(c)),
    "the dance captions appeared: " + JSON.stringify([...new Set(shuffleSeen)])
  );
});

test("a greeting makes the sentry wave", async () => {
  const { dom, clock, probe } = boot();
  await clock.run(50);
  dom.els.inp.value = "howzit tsamma";
  dom.els.send.fire("click");
  const caps = [];
  for (let i = 0; i < 30; i++) { caps.push(dom.els.cap.textContent); await clock.run(200); }
  assert.match(probe().mem.lastRoute, /greetscen/, "the brain took the greeting route");
  assert.ok(caps.some((c) => /aweh|waves/.test(c)), "wave captions: " + JSON.stringify([...new Set(caps)]));
});

test("a joke earns a cheer", async () => {
  const { dom, clock, probe } = boot();
  await clock.run(50);
  dom.els.inp.value = "tell me a joke";
  dom.els.send.fire("click");
  const caps = [];
  for (let i = 0; i < 30; i++) { caps.push(dom.els.cap.textContent); await clock.run(200); }
  assert.match(probe().mem.lastRoute, /joke/, "the brain took the joke route");
  assert.ok(caps.some((c) => /yebo/.test(c)), "cheer captions: " + JSON.stringify([...new Set(caps)]));
});

test("telling her about a bird sends her into cover", async () => {
  const { dom, clock, probe } = boot();
  await clock.run(50);
  dom.els.inp.value = "I see a bird";
  dom.els.send.fire("click");
  const caps = [];
  for (let i = 0; i < 30; i++) { caps.push(dom.els.cap.textContent); await clock.run(200); }
  assert.match(probe().mem.lastRoute, /danger/, "the brain took the danger route");
  assert.ok(
    caps.some((c) => /hawk|korhaan/.test(c)),
    "duck captions: " + JSON.stringify([...new Set(caps)])
  );
});

test("an ordinary message does not trigger a scene action", async () => {
  const { dom, clock, probe } = boot();
  await clock.run(50);
  dom.els.inp.value = "i had a long day at work";
  dom.els.send.fire("click");
  await clock.run(3000);
  assert.doesNotMatch(probe().mem.lastRoute, /dance|greetscen|joke/);
  const caps = [];
  for (let i = 0; i < 12; i++) { caps.push(dom.els.cap.textContent); await clock.run(400); }
  assert.ok(
    !caps.some((c) => /shuffle|hop|moonwalk|bounce|ta-da|aweh|waves|yebo/i.test(c)),
    "no action captions: " + JSON.stringify(caps)
  );
});

test("at night the sentry naps, and dawn wakes her", async () => {
  const { dom, clock } = boot({ hour: 22, minute: 0 });
  await clock.run(50);
  const caps = new Set();
  for (let i = 0; i < 20; i++) { caps.add(dom.els.cap.textContent); await clock.run(500); }
  assert.ok([...caps].some((c) => /zzz/.test(c)), "nap captions: " + JSON.stringify([...caps]));
  assert.equal(dom.document.body.dataset.phase, "night");
});

test("a bird flying overhead sends her into cover", async () => {
  /* 12:00 on the pinned day has a bird flyby starting at second 8 */
  const { dom, clock } = boot({ hour: 12, minute: 0 });
  await clock.run(50);
  const caps = new Set();
  for (let i = 0; i < 50; i++) { caps.add(dom.els.cap.textContent); await clock.run(500); }
  assert.ok(
    [...caps].some((c) => /hawk|korhaan/.test(c)),
    "duck_react captions: " + JSON.stringify([...caps])
  );
});

test("reduced motion: a still scene, no animation loop, no dancing", async () => {
  const { ctx, dom, clock, probe } = boot({ reducedMotion: true });
  await clock.run(50);
  const still = dom.els.art.textContent;
  assert.match(still, /\.{30,}/, "the scene is composed");
  assert.equal(dom.els.cap.textContent, ctx.window.__scene.IDLE_CAPTION);
  await clock.run(5000);
  assert.equal(dom.els.art.textContent, still, "nothing moved");

  dom.els.inp.value = "dance for me";
  dom.els.send.fire("click");
  await clock.run(3000);
  assert.match(probe().mem.lastRoute, /dance/, "the brain still answers in character");
  const caps = [];
  for (let i = 0; i < 12; i++) { caps.push(dom.els.cap.textContent); await clock.run(400); }
  assert.ok(!caps.some((c) => /shuffle|hop/.test(c)), "but the scene stays still");
});
