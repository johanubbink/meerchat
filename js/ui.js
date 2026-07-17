/* ---------- status line ---------- */
document.getElementById("brainstatus").textContent = BRAIN_STATUS;

/* ---------- animation ---------- */
const seq = [
  ["sentry","tsamma · on sentry duty",1100], ["blink","tsamma · on sentry duty",140],
  ["sentry","tsamma · on sentry duty",900],  ["look_left","checking left...",850],
  ["sentry","tsamma · on sentry duty",350],  ["look_right","checking right...",850],
  ["sentry","tsamma · on sentry duty",500],  ["flick","tail flick",300],
  ["sentry","tsamma · on sentry duty",700],  ["blink","tsamma · on sentry duty",140],
  ["sentry","tsamma · on sentry duty",600],  ["duck","is that ou skelm?!",750],
  ["sentry","all clear",1200],
];
const art = document.getElementById("art");
const capEl = document.getElementById("cap");
const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let fi = 0;
function tick() {
  const [name, caption, hold] = seq[fi];
  art.textContent = F[name]; capEl.textContent = caption;
  if (still) return;
  fi = (fi + 1) % seq.length;
  setTimeout(tick, hold);
}
tick();
function fitArt() {
  const cols = 144, rows = F.sentry.split("\n").length;
  const w = Math.min(document.body.clientWidth - 8, 760);
  const h = window.innerHeight * 0.40;
  const fsW = w / (cols * 0.62);
  const fsH = h / (rows * 1.02);
  art.style.fontSize = Math.max(3, Math.min(10, fsW, fsH)) + "px";
}
fitArt();
window.addEventListener("resize", fitArt);

/* ---------- chat ui ---------- */
const chat = document.getElementById("chat");
const inp  = document.getElementById("inp");
const send = document.getElementById("send");
function bubble(text, whoCls) {
  const d = document.createElement("div");
  d.className = "msg " + (whoCls === "me" ? "me" : "kat");
  if (whoCls === "kat") {
    const w = document.createElement("span");
    w.className = "who"; w.textContent = "tsamma";
    d.appendChild(w);
  }
  d.appendChild(document.createTextNode(text));
  chat.appendChild(d);
  chat.scrollTop = chat.scrollHeight;
  return d;
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
    try { reply = await (typeof getReply === "function" ? getReply(text) : pickReply(text)); }
    catch (e) { console.warn(e); reply = "Eish, the wind took my words there. Say again, " + who() + "?"; }
    typing.lastChild.textContent = reply;
    chat.scrollTop = chat.scrollHeight;
    busy = false;
  }, delay);
}
send.addEventListener("click", go);
inp.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
bubble("Aweh! Tsamma here — head sentry of the Duinbos mob. Ask me anything, I've got eyes on the horizon and time to chat. What do they call you?", "kat");
