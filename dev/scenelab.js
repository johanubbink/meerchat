/* Scene-lab driver. Dev-only, classic script, file:// safe.
   Reads query params (see scenelab.html header) and renders either a
   lone sprite, one frozen scene frame, or the live scheduler loop. */

const S = window.__scene;
const q = new URLSearchParams(location.search);
const artEl = document.getElementById("art");
const infoEl = document.getElementById("info");

S.expandFrames(F, FD);
S.expandRig(F, RIG);

/* fixed lab date unless ?time=HH:MM[:SS] overrides the clock (seconds
   matter to the ambient events: the bird/star ride the seconds hand) */
function labDate() {
  const t = q.get("time");
  if (!t) return new Date();
  const [h, m, s] = t.split(":").map(Number);
  return new Date(2026, 0, 14, h, m || 0, s || 0);
}

/* row/col ruler around a block of text (?grid=1) */
function withRuler(text) {
  const rows = text.split("\n");
  const w = Math.max(...rows.map((r) => r.length));
  let head = "    ";
  for (let c = 0; c < w; c++) head += c % 10 === 0 ? String((c / 10) % 10) : c % 5 === 0 ? "+" : "·";
  const body = rows.map((r, i) => String(i).padStart(3) + " " + r);
  return [head, ...body].join("\n");
}

function show(text, note, phase) {
  if (q.get("fs")) artEl.style.fontSize = q.get("fs") + "px";
  artEl.textContent = q.get("grid") ? withRuler(text) : text;
  document.body.className = phase ? "phase-" + phase : "";
  infoEl.textContent = q.get("bare") ? "" : note;
}

const spriteName = q.get("sprite");
const anim = q.get("anim");

if (spriteName) {
  /* a single sprite, alone */
  let art =
    SPR[spriteName] ||
    (SPR.trees.find((t) => t.name === spriteName) || {}).art ||
    (F[spriteName] && F[spriteName].split("\n"));
  if (!art) {
    show("", "unknown sprite: " + spriteName);
  } else {
    show(Array.isArray(art) ? art.join("\n") : art, "sprite: " + spriteName);
  }
} else if (anim && !q.get("play")) {
  /* deterministic: the Nth step of an animation, no timers */
  const seq = S.ANIMS[anim];
  const step = parseInt(q.get("step") || "0", 10) % seq.length;
  const [frame, caption, , dx, dy] = seq[step];
  const off = { dx: dx || 0, dy: dy || 0 };
  const out = S.renderFrame(labDate(), frame, F, SPR, off);
  show(
    out.text,
    `${anim}[${step}] = ${frame} · "${caption}" · dx${off.dx} dy${off.dy} · ${out.phase}`,
    out.phase
  );
} else if (anim) {
  /* live loop through the scheduler, like ui.js will drive it */
  let st = S.mkSched();
  if (anim !== "idle") st = S.schedRequest(st, anim);
  (function loop() {
    const step = S.schedStep(st);
    st = step.state;
    const out = S.renderFrame(labDate(), step.frame, F, SPR, step.off);
    show(out.text, `${step.frame} · "${step.caption}" · ${out.phase}`, out.phase);
    setTimeout(loop, step.hold);
  })();
} else {
  /* one frozen scene frame (default: sentry) */
  const frame = q.get("frame") || "sentry";
  const out = S.renderFrame(labDate(), frame, F, SPR);
  show(out.text, `frame: ${frame} · phase: ${out.phase} · ${labDate().toTimeString().slice(0, 5)}`, out.phase);
}
