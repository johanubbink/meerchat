/* Pins the scene engine: compositor semantics, z-order, sky phases, the
   scheduler state machine, and the ground-stays-put invariant that fixes
   the floor jumping when the duck frame plays. Pure Node — scene.js and
   sprites.js load via their module tails, frames.js (no tail) via a
   Function wrapper. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { read } = require("./helpers");

const scene = require("../js/scene.js");
const { SPR } = require("../js/data/sprites.js");
const F = new Function(read("js/data/frames.js") + ";return F;")();

const NOON = new Date(2026, 0, 14, 12, 0, 0);
const { GRID } = scene;

test("blit: spaces are transparent, ~ paints an opaque space, edges clip", () => {
  const g = scene.makeGrid(5, 3);
  scene.blit(g, ["#####", "#####", "#####"], 0, 0);
  scene.blit(g, [" a ", "~b~"], 1, 0);
  assert.equal(g[0].join(""), "##a##");   // spaces around "a" left the # alone
  assert.equal(g[1].join(""), "# b #");   // ~ erased to a real space
  /* clipping: partially off every edge must not throw or wrap */
  scene.blit(g, ["xy", "xy"], -1, -1);    // top-left
  scene.blit(g, ["xy", "xy"], 4, 2);      // bottom-right
  assert.equal(g[0][0], "y");             // only the in-bounds cell painted
  assert.equal(g[2][4], "x");
  assert.equal(g.length, 3);
  assert.equal(g[0].length, 5);
});

test("compose: higher z wins regardless of list order, output is deterministic", () => {
  const sprites = [
    { art: ["bb"], x: 0, y: 0, z: 5 },
    { art: ["a"], x: 0, y: 0, z: 1 },
  ];
  const out = scene.compose(sprites, 4, 2);
  assert.equal(out.split("\n")[0], "bb");
  assert.equal(out, scene.compose(sprites.slice().reverse(), 4, 2));
  assert.equal(out.split("\n").length, 2);
});

test("skyState: phase bands align with the brain's tod()", () => {
  const at = (h, m) => scene.skyState(new Date(2026, 0, 14, h, m || 0, 0));
  assert.equal(at(3).phase, "night");
  assert.equal(at(6).phase, "dawn");
  assert.equal(at(10).phase, "day");    // the eval harness clock
  assert.equal(at(16, 59).phase, "day");
  assert.equal(at(18).phase, "sunset");
  assert.equal(at(22).phase, "night");
});

test("skyState: sun rides the day arc, moon and stars own the night", () => {
  const noon = scene.skyState(NOON);
  assert.ok(noon.sun, "sun up at noon");
  assert.equal(noon.moon, null);
  assert.equal(noon.stars, null);
  assert.ok(noon.sun.y <= 2, "sun high at noon");
  const dawn = scene.skyState(new Date(2026, 0, 14, 6, 30, 0));
  assert.ok(dawn.sun.y > noon.sun.y, "sun low shortly after rising");
  assert.ok(dawn.sun.x < noon.sun.x, "sun east of noon in the morning");

  const night = scene.skyState(new Date(2026, 0, 14, 22, 0, 0));
  assert.equal(night.sun, null);
  assert.ok(night.moon, "moon up at 22:00");
  assert.equal(night.stars.length, 42);
  for (const s of night.stars) {
    assert.ok(s.y >= 0 && s.y < GRID.skyRows, "stars stay in the sky band");
    assert.match(s.ch, /^[.'*]$/);
  }
  /* star field is fixed within a night, different on another day */
  const later = scene.skyState(new Date(2026, 0, 14, 23, 15, 0));
  assert.deepEqual(later.stars, night.stars);
  const nextDay = scene.skyState(new Date(2026, 0, 15, 22, 0, 0));
  assert.notDeepEqual(nextDay.stars, night.stars);
});

test("renderFrame: grid dimensions and phase come out right", () => {
  const out = scene.renderFrame(NOON, "sentry", F, SPR);
  assert.equal(out.phase, "day");
  const rows = out.text.split("\n");
  assert.equal(rows.length, GRID.rows);
  for (const r of rows) assert.ok(r.length <= GRID.cols);
});

test("ground stays put: every pose keeps the dune line at the same rows", () => {
  /* the floor-jump bug: duck's baked ground sat 2 rows higher than every
     other frame's. The scene must pin it to GRID.groundY for all poses. */
  const dots = (row) => (row.match(/\./g) || []).length;
  for (const pose of Object.keys(F)) {
    const rows = scene.renderFrame(NOON, pose, F, SPR).text.split("\n");
    const groundRows = rows.flatMap((r, i) => (dots(r) >= 30 ? [i] : []));
    assert.deepEqual(
      groundRows,
      [GRID.groundY, GRID.groundY + 1],
      `pose "${pose}" moved the ground line`
    );
  }
});

test("expandFrames: applying a frame's row deltas onto its base reproduces it", () => {
  const sentry = F.sentry.split("\n");
  const blink = F.blink.split("\n");
  const deltas = {};
  blink.forEach((row, i) => { if (row !== sentry[i]) deltas[i] = row; });
  assert.ok(Object.keys(deltas).length > 0);
  const F2 = scene.expandFrames({ sentry: F.sentry }, { re_blink: { base: "sentry", rows: deltas } });
  assert.equal(F2.re_blink, F.blink);
});

test("scheduler: idle loops, an action interrupts once and falls back to idle", () => {
  let st = scene.mkSched();
  const idleLen = scene.ANIMS.idle.length;
  /* a full idle lap wraps back to step 0 */
  for (let i = 0; i < idleLen; i++) {
    const step = scene.schedStep(st);
    assert.deepEqual(
      [step.frame, step.caption, step.hold],
      scene.ANIMS.idle[i]
    );
    st = step.state;
  }
  assert.equal(st.i, 0);
  assert.equal(st.mode, "idle");

  /* request mid-idle: takes effect on the next step, plays through, reverts */
  st = scene.schedStep(scene.mkSched()).state;
  st = scene.schedRequest(st, "dance");
  const danceLen = scene.ANIMS.dance.length;
  for (let i = 0; i < danceLen; i++) {
    const step = scene.schedStep(st);
    assert.equal(step.frame, scene.ANIMS.dance[i][0], `dance step ${i}`);
    st = step.state;
  }
  assert.deepEqual(st, { mode: "idle", i: 0, queued: null });
});

test("scheduler: duplicate and unknown requests are dropped", () => {
  let st = scene.schedRequest(scene.mkSched(), "dance");
  st = scene.schedStep(st).state;            // now inside the dance
  assert.equal(st.mode, "dance");
  assert.equal(scene.schedRequest(st, "dance"), st);   // dup while playing
  assert.equal(scene.schedRequest(st, "moonwalk"), st); // unknown anim
});
