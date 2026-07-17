#!/usr/bin/env node
/* Drive full end-to-end conversations against the CLEVER brain and save
   transcripts for judging.

   Faithful to production: each user turn runs the real scripted brain
   (pickReply advances name/memory/pending state and yields the scripted
   reply + route), then the exact llm.js prompt is built (persona bible +
   memory note + route-derived grounding + last 8 turns) and sent to the
   local model; the reply is sanitized identically to llm.js. The "user"
   side is a persona-driven simulator on the same endpoint.

   Usage: node eval/llm_convo.js --persona chommie --turns 20 \
             --endpoint http://127.0.0.1:8080/v1 --out eval/results/llm/chommie.txt
*/
"use strict";
const fs = require("fs");
const path = require("path");
const loadBrain = require("./lib/loadBrain");
const { PERSONA, memoryNote, groundingNote, sanitize } = require("./lib/llmShared");
const PERSONAS = require("./lib/personas");

const args = {};
for (let i = 2; i < process.argv.length; i += 2)
  args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];

const ENDPOINT = args.endpoint || "http://127.0.0.1:8080/v1";
const TURNS = +(args.turns || 20);
const PKEY = args.persona || "chommie";
const SEED = +(args.seed || 1);
const OUT = args.out || `eval/results/llm/${PKEY}.txt`;

async function chat(messages, opts = {}) {
  const body = {
    messages, temperature: opts.temp ?? 0.9, top_p: 0.95,
    max_tokens: opts.max ?? 120, stream: false,
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(ENDPOINT + "/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const j = await res.json();
      return { text: j.choices[0].message.content, usage: j.usage };
    } catch (e) {
      if (attempt === 2) throw e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

/* Tsamma reply: real brain state + llm.js prompt, exactly as production */
function buildTsammaMessages(brain, hist, text, scripted, route) {
  const sys = PERSONA + "\n\nCURRENT NOTES: " + memoryNote(brain.mem) + "\n" +
    groundingNote(route, scripted);
  const msgs = [{ role: "system", content: sys }];
  for (const h of hist) {
    msgs.push({ role: "user", content: h.u });
    msgs.push({ role: "assistant", content: h.a });
  }
  msgs.push({ role: "user", content: text });
  return msgs;
}

/* User simulator: persona system prompt + the running dialogue, roles
   flipped (Tsamma's lines are the "user" the simulator responds to) */
function buildUserMessages(persona, transcript) {
  const sys = persona.system +
    `\n\nYou are the HUMAN in this chat, messaging Tsamma (a meerkat chatbot). Write ONLY your next short chat message (max ~20 words), in character. No narration, no quotes, no stage directions. Do not repeat a message you already sent.`;
  const msgs = [{ role: "system", content: sys }];
  if (transcript.length === 0) {
    msgs.push({ role: "user", content: "(You just opened the chat. Send your first message.)" });
  } else {
    for (const t of transcript) {
      msgs.push({ role: t.who === "user" ? "assistant" : "user", content: t.text });
    }
  }
  return msgs;
}

(async () => {
  const brain = loadBrain(SEED * 2654435761);
  const hist = [];          /* {u,a} pairs for Tsamma's context window */
  const transcript = [];    /* {who,text} full log */
  const stats = { genMs: [], tokS: [], fallbacks: 0 };
  const persona = PERSONAS[PKEY];
  if (!persona) throw new Error("unknown persona " + PKEY);

  for (let turn = 0; turn < TURNS; turn++) {
    /* 1. user simulator produces the next human message */
    const uMsgs = buildUserMessages(persona, transcript);
    let userText;
    try {
      const r = await chat(uMsgs, { temp: 1.0, max: 40 });
      userText = r.text.replace(/<think>[\s\S]*?<\/think>/g, "").trim()
        .replace(/^["'“]+|["'”]+$/g, "").replace(/\n[\s\S]*$/, "").trim();
    } catch (e) { userText = "ok"; }
    if (!userText) userText = "ok";
    transcript.push({ who: "user", text: userText });

    /* 2. real scripted brain advances state + gives grounding */
    const scripted = await brain.pickReply(userText);
    const route = brain.mem.lastRoute;

    /* 3. clever brain generates the actual reply */
    const tMsgs = buildTsammaMessages(brain, hist, userText, scripted, route);
    let tsammaText, usage;
    try {
      const r = await chat(tMsgs, { temp: 0.9, max: 120 });
      const clean = sanitize(r.text, scripted, hist);
      if (clean === scripted) stats.fallbacks++;
      tsammaText = clean;
      usage = r.usage;
      if (usage && usage.completion_tokens && r.usage) {
        stats.tokS.push(usage.completion_tokens);
      }
    } catch (e) {
      tsammaText = scripted; stats.fallbacks++;
    }
    transcript.push({ who: "tsamma", text: tsammaText, route });
    hist.push({ u: userText, a: tsammaText });
    if (hist.length > 8) hist.shift();

    process.stderr.write(`  [${PKEY} ${turn + 1}/${TURNS}] route=${route}\n`);
  }

  const lines = [`# persona: ${PKEY}   model: qwen3-4b-instruct   turns: ${TURNS}`, ""];
  for (const t of transcript) {
    lines.push(`${t.who === "user" ? "USER" : "TSAMMA"}: ${t.text}`);
    if (t.who === "user") lines.push("");
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, lines.join("\n"));
  const meta = {
    persona: PKEY, turns: TURNS,
    fallbackRate: +(stats.fallbacks / TURNS * 100).toFixed(1),
    nameKnown: brain.mem.name || null,
    topics: brain.mem.topics,
  };
  fs.writeFileSync(OUT.replace(/\.txt$/, ".json"), JSON.stringify(meta, null, 1));
  console.log(JSON.stringify(meta));
})();
