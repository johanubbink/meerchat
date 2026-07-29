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

/* per-frame baseline offset (rows down from GRID.katY) */
const KAT_DY = { duck: 2 };

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

/* ---------- scene assembly ---------- */

/* F: the meerkat frames object; SPR: {sun, moon, trees:[{art,x,sink}]} */
function buildScene(date, frameName, F, SPR) {
  const sky = skyState(date);
  const sprites = [{ art: GROUND_ART, x: 0, y: GRID.groundY, z: 0 }];
  if (sky.stars) for (const s of sky.stars) sprites.push({ art: [s.ch], x: s.x, y: s.y, z: 1 });
  if (sky.sun) sprites.push({ art: SPR.sun, x: sky.sun.x, y: sky.sun.y, z: 2 });
  if (sky.moon) sprites.push({ art: SPR.moon, x: sky.moon.x, y: sky.moon.y, z: 2 });
  for (const t of SPR.trees) {
    sprites.push({ art: t.art, x: t.x, y: GRID.groundY - t.art.length + (t.sink || 1), z: 5 });
  }
  sprites.push({
    art: F[frameName],
    x: 0,
    y: GRID.katY + (KAT_DY[frameName] || 0),
    z: 10,
  });
  return { sprites, phase: sky.phase };
}

/* the one call the UI makes per tick */
function renderFrame(date, frameName, F, SPR) {
  const s = buildScene(date, frameName, F, SPR);
  return { text: compose(s.sprites), phase: s.phase };
}

/* merge delta-encoded poses ({base, rows:{idx: line}}) into F */
function expandFrames(F, FD) {
  for (const name of Object.keys(FD)) {
    const d = FD[name];
    const rows = F[d.base].split("\n");
    for (const r of Object.keys(d.rows)) rows[+r] = d.rows[r];
    F[name] = rows.join("\n");
  }
  return F;
}

/* ---------- animation scheduler (pure state machine) ---------- */

const IDLE_CAPTION = "tsamma · on sentry duty";
const ANIMS = {
  idle: [
    ["sentry", IDLE_CAPTION, 1100], ["blink", IDLE_CAPTION, 140],
    ["sentry", IDLE_CAPTION, 900],  ["look_left", "checking left...", 850],
    ["sentry", IDLE_CAPTION, 350],  ["look_right", "checking right...", 850],
    ["sentry", IDLE_CAPTION, 500],  ["flick", "tail flick", 300],
    ["sentry", IDLE_CAPTION, 700],  ["blink", IDLE_CAPTION, 140],
    ["sentry", IDLE_CAPTION, 600],  ["duck", "is that ou skelm?!", 750],
    ["sentry", "all clear", 1200],
  ],
  /* placeholder shuffle from existing poses; real dance frames land with
     the dance milestone and replace these entries */
  dance: [
    ["look_left", "the sentry shuffle!", 280], ["look_right", "the sentry shuffle!", 280],
    ["look_left", "the sentry shuffle!", 280], ["look_right", "the sentry shuffle!", 280],
    ["flick", "the sentry shuffle!", 300],
    ["look_left", "the sentry shuffle!", 280], ["look_right", "the sentry shuffle!", 280],
    ["sentry", "and... back on duty", 900],
  ],
};

function mkSched() { return { mode: "idle", i: 0, queued: null }; }

/* queue an action; it starts when the current hold expires. Requests for
   the anim already playing (or unknown anims) are dropped. */
function schedRequest(state, action) {
  if (!ANIMS[action] || state.mode === action) return state;
  return { mode: state.mode, i: state.i, queued: action };
}

/* advance one step: returns what to show now and the next state.
   Non-idle anims play once, then fall back to idle step 0. */
function schedStep(state) {
  let mode = state.mode, i = state.i;
  if (state.queued && state.queued !== mode) { mode = state.queued; i = 0; }
  const seq = ANIMS[mode];
  const [frame, caption, hold] = seq[i];
  let nextMode = mode, nextI = i + 1;
  if (nextI >= seq.length) { nextI = 0; nextMode = "idle"; }
  return { frame, caption, hold, state: { mode: nextMode, i: nextI, queued: null } };
}

/* ---------- export guard (browser global / Node module) ---------- */

const __sceneAPI = {
  GRID, KAT_DY, GROUND_ART, makeGrid, blit, compose, skyState, skyArc,
  buildScene, renderFrame, expandFrames, IDLE_CAPTION, ANIMS,
  mkSched, schedRequest, schedStep,
};
if (typeof window !== "undefined") window.__scene = __sceneAPI;
if (typeof module !== "undefined" && module.exports) module.exports = __sceneAPI;
