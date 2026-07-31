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
const { SPR, FD, RIG } = require("../js/data/sprites.js");
const F = scene.expandRig(
  scene.expandFrames(new Function(read("js/data/frames.js") + ";return F;")(), FD),
  RIG
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

test("carvePart: re-blitting the carved tail at its anchor is the identity", () => {
  const part = scene.carvePart(F, { from: "sentry", rows: [56, 70], cols: [90, 112] });
  assert.equal(part.x, 90);
  assert.equal(part.y, 56);
  const g = scene.makeGrid(scene.GRID.cols, 73);
  scene.blit(g, F.sentry.split("\n"), 0, 0);
  scene.blit(g, part.art, part.x, part.y);
  const out = g.map((r) => r.join("").replace(/ +$/, "")).join("\n");
  assert.equal(out, F.sentry.split("\n").map((r) => r.replace(/ +$/, "")).join("\n"));
});

test("rig poses: expanded into F, full height, ground rows untouched, genuinely new", () => {
  const sentry = F.sentry.split("\n");
  for (const name of Object.keys(RIG.poses)) {
    assert.ok(F[name], `${name} expanded into F`);
    const rows = F[name].split("\n");
    assert.equal(rows.length, sentry.length, `${name} is full height`);
    /* rows 71-72 carry the baked feet/ground marks — never composed over */
    assert.equal(rows[71], sentry[71].replace(/ +$/, ""), `${name} row 71`);
    assert.equal(rows[72], sentry[72].replace(/ +$/, ""), `${name} row 72`);
    assert.notEqual(F[name], F.sentry, `${name} differs from sentry`);
  }
  /* a tail swap really removed the resting tail: wag_up has no ink in the
     old tail's lower reach (rows 63-68 beyond col 95) */
  const up = F.wag_up.split("\n");
  for (let r = 63; r <= 68; r++) {
    assert.equal((up[r] || "").slice(95).trim(), "", `wag_up row ${r} tail gone`);
  }
});

test("a raised arm never coexists with its baked-in folded twin", () => {
  /* the folded arms are the - shading flanking the chest (rows 20-27,
     left cols ~49-55, right cols ~70-77). A pose that raises an arm must
     ride an armless base, so that zone is plain = fur on the raised side. */
  const zones = { l: [49, 56], r: [69, 77] };
  const raised = {
    wave_lo: ["r"], wave_hi: ["r"], point_r: ["r"], point_l: ["l"],
    cheer: ["l", "r"],
  };
  for (const [pose, sides] of Object.entries(raised)) {
    const rows = F[pose].split("\n");
    for (const side of sides) {
      for (let r = 20; r <= 27; r++) {
        const band = rows[r].slice(zones[side][0], zones[side][1]);
        assert.doesNotMatch(
          band, /-{3}/,
          `${pose}: folded-arm shading still present on the ${side} at row ${r}`
        );
      }
    }
  }
  /* and the erasing never leaks into the sentry itself */
  assert.match(F.sentry.split("\n")[22].slice(69, 77), /-{3}/);
});

test("sleep: duck with the eyes shut, same crouch, same baseline corrections", () => {
  const duck = F.duck.split("\n"), sleep = F.sleep.split("\n");
  assert.doesNotMatch(sleep[13], /[#@]/, "no open pupils");
  for (let r = 0; r < duck.length; r++) {
    if (r !== 13) assert.equal(sleep[r], duck[r], `row ${r} is duck's`);
  }
  assert.equal(scene.KAT_DY.sleep, scene.KAT_DY.duck);
  assert.deepEqual(scene.KAT_GROUND_ROWS.sleep, scene.KAT_GROUND_ROWS.duck);
});

test("every step of every animation references a real frame and keeps the floor still", () => {
  const dots = (row) => (row.match(/\./g) || []).length;
  for (const [anim, seq] of Object.entries(scene.ANIMS)) {
    for (const [frame, caption, hold, dx, dy] of seq) {
      assert.ok(F[frame], `${anim}: frame "${frame}" exists`);
      assert.equal(typeof caption, "string");
      assert.ok(hold > 0, `${anim}: hold is positive`);
      const rows = scene
        .renderFrame(NOON, frame, F, SPR, { dx: dx || 0, dy: dy || 0 }, { ambient: false })
        .text.split("\n");
      const groundRows = rows.flatMap((r, i) => (dots(r) >= 30 ? [i] : []));
      assert.deepEqual(
        groundRows,
        [GRID.groundY, GRID.groundY + 1],
        `${anim} step "${frame}" dx${dx || 0} dy${dy || 0} moved the ground`
      );
    }
  }
  /* the dance pool only offers real animations */
  for (const d of scene.DANCES) assert.ok(scene.ANIMS[d], `dance "${d}" exists`);
});

test("scheduler: night swaps the idle table for the nap, dawn wakes her", () => {
  /* day (or no phase) reads ANIMS.idle */
  assert.equal(scene.schedStep(scene.mkSched(), "day").frame, scene.ANIMS.idle[0][0]);
  assert.equal(scene.schedStep(scene.mkSched()).frame, scene.ANIMS.idle[0][0]);
  /* night reads ANIMS.idle_night, and the state machine still loops */
  let st = scene.mkSched();
  const seen = [];
  for (let i = 0; i < scene.ANIMS.idle_night.length; i++) {
    const step = scene.schedStep(st, "night");
    seen.push(step.frame);
    st = step.state;
  }
  assert.deepEqual(seen, scene.ANIMS.idle_night.map((s) => s[0]));
  assert.equal(st.mode, "idle");
  /* a phase flip mid-lap can leave i past the shorter table: it must clamp */
  const deep = { mode: "idle", i: scene.ANIMS.idle.length - 1, queued: null };
  assert.equal(scene.schedStep(deep, "night").frame, scene.ANIMS.idle_night[0][0]);
  /* one-shot anims are unaffected by phase */
  st = scene.schedRequest(scene.mkSched(), "wave");
  assert.equal(scene.schedStep(st, "night").frame, scene.ANIMS.wave[0][0]);
});

test("ambient: deterministic, phase-gated, and flags the bird only overhead", () => {
  /* same instant -> same result */
  const d = new Date(2026, 0, 14, 12, 0, 14);
  assert.deepEqual(scene.ambient(d, "day", SPR), scene.ambient(d, "day", SPR));
  /* dawn and sunset have no visitors */
  for (const phase of ["dawn", "sunset"]) {
    assert.deepEqual(scene.ambient(d, phase, SPR), { sprites: [], event: null });
  }
  /* sweep a day: birds only fly by day, stars only fall at night, and the
     bird event is raised at some point of some flyby */
  let sawBirdSprite = false, sawBirdEvent = false, sawStar = false;
  for (let m = 0; m < 60; m++) {
    for (let s = 0; s < 60; s += 2) {
      const day = scene.ambient(new Date(2026, 0, 14, 12, m, s), "day", SPR);
      const night = scene.ambient(new Date(2026, 0, 14, 22, m, s), "night", SPR);
      if (day.sprites.length) { sawBirdSprite = true; assert.notEqual(day.event, "star"); }
      if (day.event === "bird") sawBirdEvent = true;
      if (night.sprites.length) { sawStar = true; assert.equal(night.event, "star"); }
      for (const sp of [...day.sprites, ...night.sprites]) {
        assert.ok(sp.y < GRID.skyRows, "visitors stay in the sky band");
      }
    }
  }
  assert.ok(sawBirdSprite, "a bird flew by within the hour");
  assert.ok(sawBirdEvent, "and was overhead at some point");
  assert.ok(sawStar, "a star fell within the hour");
  /* renderFrame carries the event through, and opts.ambient=false drops it */
  const withB = scene.renderFrame(new Date(2026, 0, 14, 12, 0, 16), "sentry", F, SPR);
  const withoutB = scene.renderFrame(
    new Date(2026, 0, 14, 12, 0, 16), "sentry", F, SPR, null, { ambient: false }
  );
  assert.equal(withoutB.event, null);
  assert.notEqual(withB.text, withoutB.text, "the visitor is drawn");
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
