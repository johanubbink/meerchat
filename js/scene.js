/* ============== SCENE ENGINE ==============
   Pure ASCII compositor + sky model + animation scheduler for the stage.
   Same discipline as brain.js: no document/window access (except the
   export guard), no Math.random, no hidden state — every function is a
   pure function of its arguments, so the whole engine is Node-testable.
   Art data (F frames, SPR sprites) is passed in, never closed over,
   mirroring js/llmShared.js. Loaded as a classic script in the browser,
   a CommonJS module in Node.

   The scene is a GRID.cols x GRID.rows character grid composed from
   z-ordered sprites {art, x, y, z}: ground z0, stars z1, sun/moon z2,
   trees z5, meerkat z10. In sprite art a space is transparent and "~"
   is an opaque space ("~" is outside the frames' charset # ' * + - . : = @ ^).

   The meerkat frames are used verbatim (frames.js is generated art and
   stays untouched). Each 73-row frame is bottom-anchored at GRID.katY;
   KAT_DY holds per-frame baseline corrections: the duck frame was drawn
   with its ground line two rows higher than every other pose, which made
   the floor visibly jump — blitting it 2 rows lower lands its baked
   ground dots on the scene's own ground rows, and its below-ground paw
   remnants clip off the grid bottom. */

const GRID = { cols: 141, rows: 88, skyRows: 15, katY: 15, groundY: 86 };

/* per-frame baseline offset (rows down from GRID.katY): the duck frame was
   redrawn with its ground line two rows higher than every other pose;
   sleep is duck with the eyes shut, so it inherits both corrections */
const KAT_DY = { duck: 2, sleep: 2 };

/* Which rows of each frame carry the artist's baked-in dune line. Those
   dots are stripped so the scene's ground layer is the only floor — the
   feet and shadow marks on the same rows are kept, since they belong to
   the meerkat and should travel with her. Without this, lifting her for a
   hop drags a ghost horizon up the screen with her. */
const KAT_GROUND_ROWS = { duck: [69, 70], sleep: [69, 70] };
const KAT_GROUND_DEFAULT = [71, 72];

/* memoized per frame, keyed on the source art so re-expanded frames don't
   serve a stale pose */
const poseCache = new Map();
function katPose(F, name) {
  const src = F[name];
  const hit = poseCache.get(name);
  if (hit && hit.src === src) return hit.art;
  const rows = src.split("\n");
  for (const r of KAT_GROUND_ROWS[name] || KAT_GROUND_DEFAULT) {
    if (rows[r] !== undefined) rows[r] = rows[r].replace(/\./g, " ");
  }
  const art = rows.join("\n");
  poseCache.set(name, { src, art });
  return art;
}

/* the stationary dune line: two full-width dot rows, indented like the
   frames' own baked ground (dots start at col 4) */
const GROUND_ART = [
  "    " + ".".repeat(GRID.cols - 4),
  "    " + ".".repeat(GRID.cols - 4),
];

/* ---------- compositor ---------- */

function makeGrid(cols, rows) {
  const g = [];
  for (let r = 0; r < rows; r++) g.push(new Array(cols).fill(" "));
  return g;
}

/* paint sprite art (string or array of lines) onto the grid at (x,y);
   spaces are transparent, "~" paints an opaque space, edges clip */
function blit(grid, art, x, y) {
  const lines = Array.isArray(art) ? art : art.split("\n");
  const rows = grid.length, cols = grid[0].length;
  for (let r = 0; r < lines.length; r++) {
    const gy = y + r;
    if (gy < 0 || gy >= rows) continue;
    const line = lines[r];
    for (let c = 0; c < line.length; c++) {
      const gx = x + c;
      if (gx < 0 || gx >= cols) continue;
      const ch = line[c];
      if (ch === " ") continue;
      grid[gy][gx] = ch === "~" ? " " : ch;
    }
  }
}

/* z-sort ascending, blit each sprite, join to one string */
function compose(sprites, cols, rows) {
  cols = cols || GRID.cols; rows = rows || GRID.rows;
  const g = makeGrid(cols, rows);
  const sorted = sprites.slice().sort((a, b) => a.z - b.z);
  for (const s of sorted) blit(g, s.art, s.x, s.y);
  return g.map((row) => row.join("").replace(/ +$/, "")).join("\n");
}

/* ---------- sky model ---------- */

/* mulberry32: tiny seeded PRNG (same as the eval harness) — stars must be
   deterministic, Math.random is banned here */
function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* arc across the sky band: t in [0,1] -> {x, y} (high at t=0.5) */
function skyArc(t, artW) {
  const x = 4 + Math.round(t * (GRID.cols - 8 - artW));
  const y = 1 + Math.round((1 - Math.sin(Math.PI * t)) * 9);
  return { x, y };
}

/* phase bands aligned with brain.js tod(): dawn 5-7, day 7-17,
   sunset 17-20, night otherwise. Sun rides 06:00-19:00, moon+stars
   own the night. */
function skyState(date) {
  const h = date.getHours();
  const min = h * 60 + date.getMinutes();
  const phase = h < 5 ? "night" : h < 7 ? "dawn" : h < 17 ? "day" : h < 20 ? "sunset" : "night";

  let sun = null, moon = null, stars = null;
  if (min >= 360 && min <= 1140) sun = skyArc((min - 360) / 780, 9);
  if (phase === "night") {
    /* 20:00 -> 05:00 is a 9h arc that wraps midnight */
    const tm = ((min - 1200 + 1440) % 1440) / 540;
    if (tm >= 0 && tm <= 1) moon = skyArc(tm, 7);
    /* star field: fixed per calendar day */
    const dayOfYear = Math.floor(
      (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 864e5
    );
    const rnd = mulberry32(date.getFullYear() * 1000 + dayOfYear);
    stars = [];
    for (let i = 0; i < 42; i++) {
      const ch = rnd() < 0.6 ? "." : rnd() < 0.7 ? "'" : "*";
      stars.push({
        x: Math.floor(rnd() * GRID.cols),
        y: Math.floor(rnd() * (GRID.skyRows - 1)),
        ch,
      });
    }
  }
  return { phase, sun, moon, stars };
}

/* ---------- ambient events ----------
   Rare, deterministic sky visitors: a shooting star at night, a bird
   (goshawk, if you ask Tsamma) by day. Each minute is seeded on its own
   calendar identity; a lucky minute gets one event at a seeded start
   second, and the sprite's position is a pure function of the seconds
   hand, so successive renders animate it without any stored state. */
const AMBIENT = { starP: 0.22, birdP: 0.12, starSecs: 7, birdSecs: 16 };

function ambient(date, phase, SPR) {
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 864e5
  );
  const minuteOfDay = date.getHours() * 60 + date.getMinutes();
  const rnd = mulberry32(
    (date.getFullYear() % 100) * 1000000 + dayOfYear * 1440 + minuteOfDay
  );
  const roll = rnd(), startSec = Math.floor(rnd() * 38);
  const kind = phase === "night" ? "star" : phase === "day" ? "bird" : null;
  if (!kind || roll >= AMBIENT[kind + "P"]) return { sprites: [], event: null };
  const dur = AMBIENT[kind + "Secs"];
  const p = (date.getSeconds() - startSec) / dur;
  if (p < 0 || p > 1) return { sprites: [], event: null };
  if (kind === "star") {
    /* streak falls from high right to low left across the sky band */
    const x = Math.round((GRID.cols - 14) * (1 - p)) + 2;
    const y = 1 + Math.round(p * (GRID.skyRows - 6));
    return { sprites: [{ art: SPR.star, x, y, z: 3 }], event: "star" };
  }
  /* bird glides left-to-right; over the meerkat it reads as a raptor */
  const x = Math.round(-10 + p * (GRID.cols + 12));
  const y = 4 + Math.round(Math.sin(p * Math.PI * 3) * 1.5);
  const overhead = x > 48 && x < 92;
  return { sprites: [{ art: SPR.bird, x, y, z: 3 }], event: overhead ? "bird" : null };
}

/* ---------- scene assembly ---------- */

/* F: the meerkat frames object; SPR: {sun, moon, trees:[{art,x,sink}]}.
   off {dx,dy} shifts only the meerkat — the scenery and the dune line stay
   put, which is what makes a sway read as the meerkat moving.
   opts.ambient=false drops the sky visitors (the reduced-motion still). */
function buildScene(date, frameName, F, SPR, off, opts) {
  const sky = skyState(date);
  const sprites = [{ art: GROUND_ART, x: 0, y: GRID.groundY, z: 0 }];
  if (sky.stars) for (const s of sky.stars) sprites.push({ art: [s.ch], x: s.x, y: s.y, z: 1 });
  if (sky.sun) sprites.push({ art: SPR.sun, x: sky.sun.x, y: sky.sun.y, z: 2 });
  if (sky.moon) sprites.push({ art: SPR.moon, x: sky.moon.x, y: sky.moon.y, z: 2 });
  let event = null;
  if (!opts || opts.ambient !== false) {
    const amb = ambient(date, sky.phase, SPR);
    for (const s of amb.sprites) sprites.push(s);
    event = amb.event;
  }
  for (const t of SPR.trees) {
    sprites.push({ art: t.art, x: t.x, y: GRID.groundY - t.art.length + (t.sink || 1), z: 5 });
  }
  sprites.push({
    art: katPose(F, frameName),
    x: (off && off.dx) || 0,
    y: GRID.katY + (KAT_DY[frameName] || 0) + ((off && off.dy) || 0),
    z: 10,
  });
  return { sprites, phase: sky.phase, event };
}

/* the one call the UI makes per tick */
function renderFrame(date, frameName, F, SPR, off, opts) {
  const s = buildScene(date, frameName, F, SPR, off, opts);
  return { text: compose(s.sprites), phase: s.phase, event: s.event };
}

/* Compose a new pose from horizontal bands of existing poses. The frames
   are image-derived: every torso row is one continuous ink run (the paws
   are shaded into the chest), so limbs can't be split off by column — but
   the poses DO differ in clean row bands (head 0-16, tail 54-70), which
   makes band splicing the granularity this art actually supports.
   parts: [{ from: frameName, rows: [start, end] }] — inclusive rows. */
function spliceRows(F, base, parts) {
  const rows = F[base].split("\n");
  for (const p of parts) {
    const src = F[p.from].split("\n");
    for (let r = p.rows[0]; r <= p.rows[1]; r++) rows[r] = src[r];
  }
  return rows.join("\n");
}

/* merge delta-encoded poses into F. A pose is either row deltas
   ({base, rows:{idx: line}}) or a band splice ({base, parts:[...]}). */
function expandFrames(F, FD) {
  for (const name of Object.keys(FD)) {
    const d = FD[name];
    if (d.parts) { F[name] = spliceRows(F, d.base, d.parts); continue; }
    const rows = F[d.base].split("\n");
    for (const r of Object.keys(d.rows)) rows[+r] = d.rows[r];
    F[name] = rows.join("\n");
  }
  return F;
}

/* ---------- segmented rig ----------
   The meerkat as parts. The frames can't be cut into limbs by column
   (torso rows are continuous ink runs), but three things ARE separable:
   the head band (rows 0-16), the tail (a detached diagonal right of the
   skirt, which never crosses its column range), and empty canvas beside
   the torso where new limbs can be drawn in. A rig pose is therefore:
   a base frame, an optional head band swap, an optional tail swap
   (erase the base tail rect, blit a tail part at its hip anchor), and
   additive overlays (arms) blitted onto the open canvas. Rig poses are
   composed once at load into F, so everything downstream — katPose, the
   scheduler, the scene lab's ?frame= — treats them as ordinary frames. */

/* cut a rect {from, rows:[r0,r1], cols:[c0,c1]} out of a frame; the part
   remembers its home anchor so re-blitting it at (x,y) is the identity */
function carvePart(F, mask) {
  const rows = F[mask.from].split("\n");
  const art = [];
  for (let r = mask.rows[0]; r <= mask.rows[1]; r++) {
    art.push((rows[r] || "").slice(mask.cols[0], mask.cols[1] + 1));
  }
  return { art, x: mask.cols[0], y: mask.rows[0] };
}

/* compose one rig pose config into a full frame string.
   cfg: { base, head?, tail? {erase:[rows,cols], part, dx?, dy?},
          overlays?: [{part, x, y}] } — part names index RIG.parts. */
function composeRigPose(F, parts, cfg) {
  const src = cfg.head
    ? spliceRows(F, cfg.base, [{ from: cfg.head, rows: [0, 16] }])
    : F[cfg.base];
  const rows = src.split("\n");
  const g = makeGrid(GRID.cols, rows.length);
  blit(g, rows, 0, 0);
  if (cfg.tail) {
    const er = cfg.tail.erase;
    for (let r = er.rows[0]; r <= er.rows[1]; r++) {
      for (let c = er.cols[0]; c <= er.cols[1]; c++) g[r][c] = " ";
    }
    const p = parts[cfg.tail.part];
    blit(g, p.art, p.x + (cfg.tail.dx || 0), p.y + (cfg.tail.dy || 0));
  }
  for (const ov of cfg.overlays || []) {
    const p = parts[ov.part];
    blit(g, p.art, ov.x !== undefined ? ov.x : p.x, ov.y !== undefined ? ov.y : p.y);
  }
  return g.map((row) => row.join("").replace(/ +$/, "")).join("\n");
}

/* RIG: { carve: {name: mask}, parts: {name: {art, x, y}}, poses: {name: cfg} }.
   Carved parts join the literal ones, then every pose lands in F. */
function expandRig(F, RIG) {
  const parts = {};
  for (const name of Object.keys(RIG.parts || {})) parts[name] = RIG.parts[name];
  for (const name of Object.keys(RIG.carve || {})) parts[name] = carvePart(F, RIG.carve[name]);
  for (const name of Object.keys(RIG.poses)) {
    F[name] = composeRigPose(F, parts, RIG.poses[name]);
  }
  return F;
}

/* ---------- animation scheduler (pure state machine) ---------- */

/* animation steps are [frame, caption, holdMs, dx, dy] — dx/dy shift the
   meerkat only, so a sway or a hop moves her against a fixed dune */
const IDLE_CAPTION = "tsamma · on sentry duty";
const SHUFFLE = "the sentry shuffle!";
const ZZZ = "zzz... zzz...";
const ANIMS = {
  idle: [
    ["sentry", IDLE_CAPTION, 1100], ["blink", IDLE_CAPTION, 140],
    ["sentry", IDLE_CAPTION, 900],  ["look_left", "checking left...", 850],
    ["sentry", IDLE_CAPTION, 350],  ["look_right", "checking right...", 850],
    ["sentry", IDLE_CAPTION, 500],  ["flick", "tail flick", 300],
    ["sentry", IDLE_CAPTION, 700],  ["blink", IDLE_CAPTION, 140],
    ["sentry", IDLE_CAPTION, 600],  ["point_l", "movement by the west dune...", 900],
    ["sentry", IDLE_CAPTION, 500],  ["duck", "is that ou skelm?!", 750],
    ["sentry", "all clear", 1200],  ["wag_up", "all lekker", 260],
    ["wag_down", "all lekker", 260],["sentry", IDLE_CAPTION, 800],
    ["point_r", "korhaan, two o'clock", 900],
    ["sentry", IDLE_CAPTION, 1000],
  ],
  /* night watch is a nap: long holds, closed eyes, the odd startle */
  idle_night: [
    ["sleep", ZZZ, 2800], ["sleep", "zzz... (dreaming of scorpions)", 2600],
    ["sleep", ZZZ, 3000], ["duck", "...huh? all quiet", 900],
    ["sleep", ZZZ, 3200],
  ],
  /* Sway left, sway right, twice, then a hop and a spin flourish. At this
     glyph scale the horizontal lean reads as motion far better than any
     limb edit could, and it costs no new art. */
  dance: [
    ["dance_l", SHUFFLE, 260, -3, 0], ["sentry", SHUFFLE, 200, 0, 0],
    ["dance_r", SHUFFLE, 260, 3, 0],  ["sentry", SHUFFLE, 200, 0, 0],
    ["dance_l", SHUFFLE, 240, -3, 0], ["sentry", SHUFFLE, 180, 0, 0],
    ["dance_r", SHUFFLE, 240, 3, 0],  ["sentry", SHUFFLE, 180, 0, 0],
    ["dance_spin", "...and a hop!", 220, -2, -3],
    ["dance_spin", "...and a hop!", 220, 2, -3],
    ["flick", SHUFFLE, 260, 0, 0],
    ["sentry", "and... back on duty", 1100, 0, 0],
  ],
  /* paws pumping the air on every bounce */
  dance_bounce: [
    ["cheer", "the dune bounce!", 240, 0, -2], ["sentry", "the dune bounce!", 220, 0, 0],
    ["cheer", "the dune bounce!", 240, 0, -3], ["sentry", "the dune bounce!", 220, 0, 0],
    ["cheer", "the dune bounce!", 240, 0, -2], ["sentry", "the dune bounce!", 220, 0, 0],
    ["wag_up", "shake the tail...", 240, 0, 0], ["wag_down", "shake the tail...", 240, 0, 0],
    ["cheer", "big finish!", 320, 0, -3],
    ["sentry", "and... back on duty", 1100, 0, 0],
  ],
  /* glide left while looking right — the Kalahari moonwalk */
  dance_moonwalk: [
    ["look_right", "the moonwalk...", 260, -2, 0],
    ["look_right", "the moonwalk...", 260, -4, 0],
    ["look_right", "the moonwalk...", 260, -6, 0],
    ["flick", "the moonwalk...", 260, -6, 0],
    ["look_left", "...and back", 260, -4, 0],
    ["look_left", "...and back", 260, -2, 0],
    ["dance_spin", "ta-da!", 260, 0, -2],
    ["sentry", "and... back on duty", 1100, 0, 0],
  ],
  /* spins, tail flourish, arms-up finale */
  dance_flourish: [
    ["dance_spin", "spin!", 220, -2, -1], ["dance_spin", "spin!", 220, 2, -1],
    ["dance_spin", "spin!", 220, -2, -1], ["dance_spin", "spin!", 220, 2, -1],
    ["wag_up", "tail flourish...", 240, 0, 0], ["wag_down", "tail flourish...", 240, 0, 0],
    ["wag_up", "tail flourish...", 240, 0, 0],
    ["cheer", "TA-DAAA!", 500, 0, -3],
    ["sentry", "and... back on duty", 1100, 0, 0],
  ],
  /* the happy wag */
  wag: [
    ["wag_up", "*wiggle*", 240], ["wag_down", "*wiggle*", 240],
    ["wag_up", "*wiggle*", 240], ["wag_down", "*wiggle*", 240],
    ["wag_up", "*wiggle*", 240], ["flick", "happy tail!", 320],
    ["sentry", IDLE_CAPTION, 900],
  ],
  /* paw up, paw higher — hello there */
  wave: [
    ["wave_lo", "aweh!", 280], ["wave_hi", "aweh!", 280],
    ["wave_lo", "*waves*", 260], ["wave_hi", "*waves*", 280],
    ["sentry", IDLE_CAPTION, 900],
  ],
  /* both paws up plus a hop */
  cheer: [
    ["cheer", "yebo!", 320, 0, 0], ["cheer", "yebo!", 260, 0, -3],
    ["cheer", "yebo!", 320, 0, 0],
    ["sentry", IDLE_CAPTION, 900],
  ],
  /* something crossed the sky — down, wait, up */
  duck_react: [
    ["duck", "hawk?! eyes down!", 900], ["duck", "...", 700],
    ["sentry", "false alarm. probably a korhaan.", 1300],
  ],
};

/* the dance request pool: ui.js picks one at random per dance route */
const DANCES = ["dance", "dance_bounce", "dance_moonwalk", "dance_flourish"];

function mkSched() { return { mode: "idle", i: 0, queued: null }; }

/* queue an action; it starts when the current hold expires. Requests for
   the anim already playing (or unknown anims) are dropped. */
function schedRequest(state, action) {
  if (!ANIMS[action] || state.mode === action) return state;
  return { mode: state.mode, i: state.i, queued: action };
}

/* advance one step: returns what to show now and the next state.
   Non-idle anims play once, then fall back to idle step 0. The optional
   phase swaps the idle table for the night nap; state.mode stays "idle"
   either way, so dawn wakes her without any transition bookkeeping. */
function schedStep(state, phase) {
  let mode = state.mode, i = state.i;
  if (state.queued && state.queued !== mode) { mode = state.queued; i = 0; }
  const table = mode === "idle" && phase === "night" ? "idle_night" : mode;
  const seq = ANIMS[table];
  if (i >= seq.length) i = 0; /* the idle/night tables differ in length */
  const [frame, caption, hold, dx, dy] = seq[i];
  let nextMode = mode, nextI = i + 1;
  if (nextI >= seq.length) { nextI = 0; nextMode = "idle"; }
  return {
    frame, caption, hold,
    off: { dx: dx || 0, dy: dy || 0 },
    state: { mode: nextMode, i: nextI, queued: null },
  };
}

/* ---------- export guard (browser global / Node module) ---------- */

const __sceneAPI = {
  GRID, KAT_DY, KAT_GROUND_ROWS, GROUND_ART, katPose,
  makeGrid, blit, compose, skyState, skyArc, ambient,
  buildScene, renderFrame, spliceRows, expandFrames, IDLE_CAPTION, ANIMS,
  carvePart, composeRigPose, expandRig, DANCES,
  mkSched, schedRequest, schedStep,
};
if (typeof window !== "undefined") window.__scene = __sceneAPI;
if (typeof module !== "undefined" && module.exports) module.exports = __sceneAPI;
