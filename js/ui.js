/* ---------- scene & animation ---------- */
const S = window.__scene;
S.expandFrames(F, FD);
S.expandRig(F, RIG);
const art = document.getElementById("art");
const capEl = document.getElementById("cap");
const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* compose the scene (sky, ground, trees, meerkat) for one pose and paint it.
   Returns the ambient event (if any) so the loop can react to the sky. */
function draw(frame, caption, off, opts) {
  const out = S.renderFrame(new Date(), frame, F, SPR, off, opts);
  art.textContent = out.text;
  document.body.dataset.phase = out.phase;
  capEl.textContent = caption;
  return out.event;
}

/* one loop, one timer: actions never spawn a second chain — runAction only
   queues a request that the next schedStep consumes */
let schedState = S.mkSched();
function loop() {
  const phase = S.skyState(new Date()).phase;
  const step = S.schedStep(schedState, phase);
  schedState = step.state;
  const event = draw(step.frame, step.caption, step.off);
  /* a raptor overhead sends an idle sentry into cover */
  if (event === "bird" && schedState.mode === "idle") runAction("duck_react");
  setTimeout(loop, step.hold);
}

/* action seam: chat routes (and later, pointer input) trigger scene anims */
function runAction(name) {
  if (still) return;
  schedState = S.schedRequest(schedState, name);
}

if (still) {
  draw("sentry", S.IDLE_CAPTION, null, { ambient: false });
  /* no motion, but the sky still follows the clock (discrete updates) */
  setInterval(() => draw("sentry", S.IDLE_CAPTION, null, { ambient: false }), 30000);
} else loop();

/* fit the scene grid to the viewport; glyph advance measured once (0.62 fallback) */
function glyphRatio() {
  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre;font-size:10px;";
  probe.textContent = "#".repeat(100);
  art.parentNode.appendChild(probe);
  const r = probe.getBoundingClientRect().width / 1000;
  probe.remove();
  return r > 0.3 && r < 1 ? r : 0.62;
}
const ADV = glyphRatio();
function fitArt() {
  const w = Math.min(document.body.clientWidth - 8, 760);
  /* 0.46 of the viewport, not 0.40: the grid grew from 73 to 88 rows when the
     sky band was added, and this keeps the meerkat about the size she was
     before it. Must stay under .stage's max-height in css/style.css. */
  const h = window.innerHeight * 0.46;
  const fsW = w / (S.GRID.cols * ADV);
  const fsH = h / (S.GRID.rows * 1.02); /* 1.02 = line-height in css/style.css */
  art.style.fontSize = Math.max(3, Math.min(10, fsW, fsH)) + "px";
}
fitArt();
window.addEventListener("resize", fitArt);

/* ---------- chat ui ---------- */
const chat = document.getElementById("chat");
const inp  = document.getElementById("inp");
const send = document.getElementById("send");
/* returns the bubble's text node, so a caller can update the text later */
function bubble(text, whoCls) {
  const d = document.createElement("div");
  d.className = "msg " + (whoCls === "me" ? "me" : "kat");
  if (whoCls === "kat") {
    const w = document.createElement("span");
    w.className = "who"; w.textContent = "tsamma";
    d.appendChild(w);
  }
  const body = document.createTextNode(text);
  d.appendChild(body);
  chat.appendChild(d);
  chat.scrollTop = chat.scrollHeight;
  return body;
}
/* route pattern -> scene action (a string, or a function for a per-hit
   pick). Pointer input will call runAction() with the same names once
   that layer lands. Dance requests draw from S.DANCES so repeat "dance!"
   messages get variety — the random pick lives here, scene.js stays pure. */
const pickDance = () => S.DANCES[Math.floor(Math.random() * S.DANCES.length)];
const ROUTE_ACTIONS = [
  [/^(regex|keyword|fuzzy-(strong|weak)):dance\b/, pickDance],
  [/^cont:again:dance\b/, pickDance],
  [/^(regex|keyword|fuzzy-(strong|weak)):greetscen\b/, "wave"],
  [/^(regex|keyword|fuzzy-(strong|weak)):byescen\b/, "wave"],
  [/^(regex|keyword|fuzzy-(strong|weak)):joke\b/, "cheer"],
  [/^cont:again:joke\b/, "cheer"],
  /* the user reports a threat ("I see a bird!") — the sentry takes cover */
  [/^(regex|keyword|fuzzy-(strong|weak)):danger\b/, "duck_react"],
];
let busy = false;
function go() {
  const text = inp.value.trim();
  if (!text || busy) return;
  busy = true;
  inp.value = "";
  bubble(text, "me");
  const typing = bubble("...", "kat");
  const delay = 500 + Math.random() * 700;
  setTimeout(async () => {
    let reply;
    /* getReply exists only when the clever-brain layer (llm.js) is loaded */
    try { reply = await (typeof getReply === "function" ? getReply(text) : pickReply(text)); }
    catch (e) { console.warn(e); reply = "Eish, the wind took my words there. Say again, " + who() + "?"; }
    typing.textContent = reply;
    chat.scrollTop = chat.scrollHeight;
    /* the route the brain took decides whether the scene does something —
       the brain itself stays presentation-agnostic */
    const act = ROUTE_ACTIONS.find(([re]) => re.test(mem.lastRoute || ""));
    if (act) runAction(typeof act[1] === "function" ? act[1]() : act[1]);
    busy = false;
  }, delay);
}
send.addEventListener("click", go);
inp.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
bubble("Aweh! Tsamma here — head sentry of the Duinbos mob. Ask me anything, I've got eyes on the horizon and time to chat. What do they call you?", "kat");
