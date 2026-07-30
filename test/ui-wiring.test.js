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

function boot({ reducedMotion = false } = {}) {
  const dom = mkDom();
  const clock = mkClock();
  const win = {
    matchMedia: () => ({ matches: reducedMotion }),
    addEventListener() {},
    innerHeight: 760,
  };
  const ctx = {
    window: win,
    document: dom.document,
    console: { warn() {}, log() {} },
    setTimeout: clock.setTimeout,
    setInterval: clock.setInterval,
    clearTimeout: clock.clearTimeout,
    clearInterval: clock.clearInterval,
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
  dom.els.inp.value = "dance for me";
  dom.els.send.fire("click");
  await clock.run(3000);
  /* the brain answered in character... */
  assert.ok(dom.els.chat.children.length >= 3, "user bubble + reply bubble were added");
  assert.match(probe().mem.lastRoute, /dance/, "the brain took the dance route");
  /* ...and the scene ran the dance: its captions are distinctive */
  const shuffleSeen = [];
  for (let i = 0; i < 14; i++) {
    shuffleSeen.push(dom.els.cap.textContent);
    await clock.run(400);
  }
  assert.ok(
    shuffleSeen.some((c) => /shuffle|hop/.test(c)),
    "the dance captions appeared: " + JSON.stringify(shuffleSeen.slice(0, 6))
  );
});

test("an ordinary message does not trigger a scene action", async () => {
  const { dom, clock, probe } = boot();
  await clock.run(50);
  dom.els.inp.value = "tell me a joke";
  dom.els.send.fire("click");
  await clock.run(3000);
  assert.doesNotMatch(probe().mem.lastRoute, /dance/);
  const caps = [];
  for (let i = 0; i < 12; i++) { caps.push(dom.els.cap.textContent); await clock.run(400); }
  assert.ok(!caps.some((c) => /shuffle|hop/.test(c)), "no dance captions: " + JSON.stringify(caps));
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
