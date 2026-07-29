/* ---------- scene & animation ---------- */
const S = window.__scene;
S.expandFrames(F, FD);
const art = document.getElementById("art");
const capEl = document.getElementById("cap");
const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* compose the scene (sky, ground, trees, meerkat) for one pose and paint it */
function draw(frame, caption) {
  const out = S.renderFrame(new Date(), frame, F, SPR);
  art.textContent = out.text;
  document.body.dataset.phase = out.phase;
  capEl.textContent = caption;
}

/* one loop, one timer: actions never spawn a second chain — runAction only
   queues a request that the next schedStep consumes */
let schedState = S.mkSched();
function loop() {
  const step = S.schedStep(schedState);
  schedState = step.state;
  draw(step.frame, step.caption);
  setTimeout(loop, step.hold);
}

/* action seam: chat routes (and later, pointer input) trigger scene anims */
function runAction(name) {
  if (still) return;
  schedState = S.schedRequest(schedState, name);
}

if (still) {
  draw("sentry", S.IDLE_CAPTION);
  /* no motion, but the sky still follows the clock (discrete updates) */
  setInterval(() => draw("sentry", S.IDLE_CAPTION), 30000);
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
  const h = window.innerHeight * 0.40;
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
    busy = false;
  }, delay);
}
send.addEventListener("click", go);
inp.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
bubble("Aweh! Tsamma here — head sentry of the Duinbos mob. Ask me anything, I've got eyes on the horizon and time to chat. What do they call you?", "kat");
