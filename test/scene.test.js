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
const { SPR, FD } = require("../js/data/sprites.js");
const F = scene.expandFrames(
  new Function(read("js/data/frames.js") + ";return F;")(),
  FD
);

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

test("katPose: the baked dune is stripped, the feet marks on those rows stay", () => {
  const raw = F.sentry.split("\n");
  const posed = scene.katPose(F, "sentry").split("\n");
  assert.match(raw[71], /\./, "the raw frame has baked ground dots");
  assert.doesNotMatch(posed[71], /\./, "the posed sprite has none");
  assert.match(posed[71], /-{5,}/, "but keeps the feet/shadow marks");
  /* everything above the ground rows is untouched */
  for (let r = 0; r < 69; r++) assert.equal(posed[r], raw[r], `row ${r}`);
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

test("spliceRows: a band splice takes those rows from the donor, rest from the base", () => {
  const out = scene.spliceRows(F, "sentry", [{ from: "look_left", rows: [0, 16] }]).split("\n");
  const sentry = F.sentry.split("\n"), left = F.look_left.split("\n");
  for (let r = 0; r <= 16; r++) assert.equal(out[r], left[r], `row ${r} from donor`);
  for (let r = 17; r < sentry.length; r++) assert.equal(out[r], sentry[r], `row ${r} from base`);
});

test("dance poses exist, are full-height, and never splice the ground rows", () => {
  for (const name of ["dance_l", "dance_r", "dance_spin"]) {
    assert.ok(F[name], `${name} expanded into F`);
    const rows = F[name].split("\n");
    assert.equal(rows.length, F.sentry.split("\n").length);
    /* rows 71-72 carry the baked feet/ground marks — they must stay the
       base pose's, so the dune line never shifts */
    const sentry = F.sentry.split("\n");
    assert.equal(rows[71], sentry[71], `${name} row 71`);
    assert.equal(rows[72], sentry[72], `${name} row 72`);
  }
  /* the splice really produced something new */
  assert.notEqual(F.dance_l, F.sentry);
  assert.notEqual(F.dance_l, F.look_left);
});

test("sway offsets move the meerkat but not the scenery or the dune line", () => {
  const plain = scene.renderFrame(NOON, "sentry", F, SPR).text.split("\n");
  const swayed = scene.renderFrame(NOON, "sentry", F, SPR, { dx: -3, dy: 0 }).text.split("\n");
  assert.notDeepEqual(swayed, plain, "the meerkat moved");
  /* the tree bands (well clear of the meerkat) are untouched */
  const treeCols = (row) => row.slice(0, 30);
  for (let r = 60; r < 80; r++) {
    assert.equal(treeCols(swayed[r]), treeCols(plain[r]), `tree columns at row ${r}`);
  }
  /* and the ground stays exactly where it is, for every dance step */
  const dots = (row) => (row.match(/\./g) || []).length;
  for (const [frame, , , dx, dy] of scene.ANIMS.dance) {
    const rows = scene.renderFrame(NOON, frame, F, SPR, { dx: dx || 0, dy: dy || 0 })
      .text.split("\n");
    const groundRows = rows.flatMap((r, i) => (dots(r) >= 30 ? [i] : []));
    assert.deepEqual(
      groundRows,
      [GRID.groundY, GRID.groundY + 1],
      `dance step ${frame} dx${dx} dy${dy} moved the ground`
    );
  }
});

test("scheduler: every step carries an offset, and the dance actually sways", () => {
  let st = scene.schedRequest(scene.mkSched(), "dance");
  const offsets = [];
  for (let i = 0; i < scene.ANIMS.dance.length; i++) {
    const step = scene.schedStep(st);
    st = step.state;
    assert.equal(typeof step.off.dx, "number");
    assert.equal(typeof step.off.dy, "number");
    offsets.push(step.off.dx);
  }
  assert.ok(offsets.some((d) => d < 0), "sways left");
  assert.ok(offsets.some((d) => d > 0), "sways right");
  /* idle never shifts her off the mound */
  let ist = scene.mkSched();
  for (let i = 0; i < scene.ANIMS.idle.length; i++) {
    const step = scene.schedStep(ist);
    ist = step.state;
    assert.deepEqual(step.off, { dx: 0, dy: 0 }, "idle stays centred");
  }
});

test("scheduler: duplicate and unknown requests are dropped", () => {
  let st = scene.schedRequest(scene.mkSched(), "dance");
  st = scene.schedStep(st).state;            // now inside the dance
  assert.equal(st.mode, "dance");
  assert.equal(scene.schedRequest(st, "dance"), st);   // dup while playing
  assert.equal(scene.schedRequest(st, "moonwalk"), st); // unknown anim
});
