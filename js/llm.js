/* ============== CLEVER BRAIN (v13 prototype) ==============
   Progressive enhancement: an on-device LLM rewrites/composes Tsamma's
   replies, grounded in the scripted brain's routed answer. The classical
   brain (brain.js) keeps running as router, state machine and instant
   fallback — the page works exactly as before if the model never loads.

   Backends, in order of preference:
   1. WebLLM (@mlc-ai/web-llm) over WebGPU — real users. Tries the largest
      model first and steps down on failure.
   2. A local OpenAI-compatible endpoint (llama.cpp / ollama) for
      development: enabled with ?llm=<url> or auto-detected on localhost.

   URL params: ?brain=classic (disable), ?model=<webllm-id> (force tier),
   ?llm=<url>|dev (dev endpoint).

   Requires js/llmShared.js (persona bible, buildMessages, sanitize) to be
   loaded first — when re-enabling, add BOTH script tags between brain.js
   and ui.js. */

const LLM = (() => {
  const params = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
  const state = {
    ready: false, backend: null, model: null, failures: 0,
    lastMs: 0, tokS: 0, hist: [],
  };

  /* largest first; ids must exist in WebLLM's prebuilt config */
  const TIERS = [
    "Qwen3.5-9B-q4f16_1-MLC",
    "Llama-3.1-8B-Instruct-q4f16_1-MLC",
    "Qwen3-4B-q4f16_1-MLC",
    "Qwen2.5-3B-Instruct-q4f16_1-MLC",
    "Qwen3-1.7B-q4f16_1-MLC",
    "Llama-3.2-1B-Instruct-q4f16_1-MLC",
  ];

  /* PERSONA, buildMessages and sanitize live in js/llmShared.js (shared
     with the Node eval harness); this layer passes its own mem/hist in */

  function setStatus(t) {
    const el = document.getElementById("brainstatus");
    if (el) el.textContent = t;
  }
  function readyStatus() {
    const speed = state.tokS ? ` · ${state.tokS.toFixed(0)} tok/s` : "";
    setStatus(`clever brain · ${state.model}${speed} · scripted fallback armed`);
  }

  /* ---------- backends ---------- */
  let engine = null;   /* WebLLM engine */
  let devUrl = null;   /* OpenAI-compatible base, e.g. http://localhost:8080/v1 */

  async function genWebLLM(messages) {
    const t0 = performance.now();
    const res = await engine.chat.completions.create({
      messages, temperature: 0.9, top_p: 0.95, max_tokens: 120,
    });
    state.lastMs = performance.now() - t0;
    const u = res.usage;
    if (u && u.completion_tokens) state.tokS = u.completion_tokens / (state.lastMs / 1000);
    return res.choices[0].message.content;
  }

  async function genDev(messages) {
    const t0 = performance.now();
    const res = await fetch(devUrl + "/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, temperature: 0.9, top_p: 0.95, max_tokens: 120, stream: false }),
    });
    if (!res.ok) throw new Error("dev endpoint " + res.status);
    const j = await res.json();
    state.lastMs = performance.now() - t0;
    const u = j.usage;
    if (u && u.completion_tokens) state.tokS = u.completion_tokens / (state.lastMs / 1000);
    return j.choices[0].message.content;
  }

  async function initWebLLM() {
    if (!navigator.gpu) return false;
    const adapter = await navigator.gpu.requestAdapter().catch(() => null);
    if (!adapter) return false;
    setStatus("clever brain · fetching runtime...");
    const webllm = await import("https://esm.run/@mlc-ai/web-llm");
    const known = new Set(webllm.prebuiltAppConfig.model_list.map((m) => m.model_id));
    const want = params.get("model");
    const tiers = want ? [want] : TIERS.filter((t) => known.has(t));
    for (const id of tiers) {
      try {
        setStatus(`clever brain loading ${id.split("-q4")[0]}...`);
        engine = await webllm.CreateMLCEngine(id, {
          initProgressCallback: (p) =>
            setStatus(`clever brain loading ${id.split("-q4")[0]} · ${Math.round((p.progress || 0) * 100)}%`),
        });
        state.backend = "webllm"; state.model = id.replace(/-q4.*$/, "");
        return true;
      } catch (e) {
        console.warn("webllm tier failed:", id, e);
        engine = null;
      }
    }
    return false;
  }

  async function initDev() {
    const p = params.get("llm");
    const base = p && p !== "dev" ? p.replace(/\/$/, "")
      : (location.hostname === "localhost" || location.hostname === "127.0.0.1")
        ? "http://localhost:8080/v1" : null;
    if (!base) return false;
    try {
      const ctl = new AbortController();
      setTimeout(() => ctl.abort(), 1500);
      const res = await fetch(base + "/models", { signal: ctl.signal });
      if (!res.ok) return false;
      const j = await res.json();
      devUrl = base;
      state.backend = "dev";
      state.model = ((j.data && j.data[0] && j.data[0].id) || "local-llm")
        .split("/").pop().replace(/\.gguf$/i, "");
      return true;
    } catch (e) { return false; }
  }

  /* ---------- the reply used by the UI ---------- */
  async function smartReply(text) {
    const scripted = await pickReply(text);   /* state machine always advances */
    if (!state.ready) return scripted;
    const route = mem.lastRoute;
    try {
      const gen = state.backend === "webllm" ? genWebLLM : genDev;
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 30000));
      const out = await Promise.race([gen(buildMessages(text, scripted, route, mem, state.hist)), timeout]);
      const clean = sanitize(out, scripted, state.hist);
      state.hist.push({ u: text, a: clean });
      if (state.hist.length > 8) state.hist.shift();
      state.failures = 0;
      readyStatus();
      return clean;
    } catch (e) {
      console.warn("clever brain failed, using scripted reply:", e);
      state.failures++;
      if (state.failures >= 3) { state.ready = false; setStatus(BRAIN_STATUS); }
      state.hist.push({ u: text, a: scripted });
      if (state.hist.length > 8) state.hist.shift();
      return scripted;
    }
  }

  async function init() {
    if (params.get("brain") === "classic") return;
    try {
      if (await initDev() || await initWebLLM()) {
        state.ready = true;
        readyStatus();
      }
    } catch (e) { console.warn("clever brain unavailable:", e); setStatus(BRAIN_STATUS); }
  }
  init();

  return {
    state, smartReply,
    /* same console-debug surface as before, with this layer's mem/hist */
    buildMessages: (text, scripted, route) => buildMessages(text, scripted, route, mem, state.hist),
    sanitize: (out, fallback) => sanitize(out, fallback, state.hist),
  };
})();

/* ui.js prefers this over the scripted pickReply when the LLM is ready */
function getReply(text) { return LLM.smartReply(text); }
