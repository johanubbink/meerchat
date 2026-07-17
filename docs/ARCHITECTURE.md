# MeerChat architecture

MeerChat is a fully offline, dependency-free chatbot: Tsamma, a meerkat sentry
in the Kalahari, chats in South African English. Hosted as a static site on
GitHub Pages (meerchat.co.za). No network calls, no build step; it must keep
working when opened directly from disk (`file://`).

## File layout

```
index.html          shell: markup + script tags, loaded in order
css/style.css       all styling (desert theme, chat bubbles, input bar)
js/data/frames.js   ASCII-art animation frames (F)
js/data/responses.js  1000-line generic fallback pool (R), tagged by category
js/data/protos.js   extra prototype sentences + keywords per scenario (data)
js/brain.js         all chat logic, no DOM access (testable in Node)
js/llm.js           clever brain: optional on-device LLM layer (v13)
js/ui.js            DOM wiring: animation loop, art scaling, chat bubbles
```

Scripts are classic (non-module) tags so `file://` keeps working. `js/brain.js`
never touches `document`/`window` except to export `window.__meer` when a
window exists, so Node tests can load it directly.

## The brain (js/brain.js, v12)

State lives in `mem`: user name, turn count, last scenario, pending-question
flag (did Tsamma just ask something), name-capture window countdown, up to 3
remembered topics, short history with per-reply route provenance
(`mem.lastRoute`, e.g. `fuzzy-strong:joke:0.612`).

### Knowledge

- `SCEN`: 84 scenarios. Each has an `id`, answer pool `a`, and up to three
  ways to be matched: `re` (exact regex), `protos` (prototype sentences for
  fuzzy matching), `kw` (keyword substrings). Optional: `more` (continuation
  parts), `asks` (Tsamma asked the user a question), `dyn` (dynamic answer,
  e.g. recalling the user's name). `js/data/protos.js` merges in ~900 extra
  prototypes and ~580 extra keywords at startup.
- `R`: 1000 generic replies; only the neutral `chat` category is still used,
  as a rare variety valve.
- `ELIZA`: reflection rules ("i feel X" → "Why do you feel X?") with pronoun
  swapping and object-pronoun repair ("chatting to I" → "to me").
- Clarify pools: honest in-character fallbacks per situation — question
  deflection ("beyond my dune"), gibberish ("say it again"), statement echo
  ("tell me more about {E}?"), and valence-matched invitations for
  emotional messages.

### Intent classifier

Classical information retrieval: prototype sentences are tokenised (stopword
and filler removal, contraction/typo normalisation `CONTR`, thesaurus `SYN`,
light suffix stemming) into TF-IDF vectors; a message is scored by cosine
similarity against every prototype. Out-of-vocabulary query tokens map to the
closest vocabulary word by character-bigram Dice similarity ("wher" →
"where") — classic spell correction that preserves the zero-similarity
baseline for unrelated text. Keyword matching runs on stem-normalised tokens
with a precision guard (nothing may be dropped in normalisation; no short
generic stems; some words are exact-only). Thresholds `TH.strong` (0.58) and
`TH.weak` (0.42), tuned on the eval harness. `__meer.probe("text")` shows top
matches in the console.

Routing is dialogue-state aware:

- **Answering gate**: if Tsamma just asked a question, a short (≤8 words)
  non-question reply is treated as an answer — scenarios need very confident
  evidence to hijack it.
- **OOV-question gate**: questions containing words the brain has never seen
  ("magnets") prefer an honest deflection over a lookalike answer.
- **Statement gate**: declarative messages can't land on question-only
  scenarios (`BOTQ`) without clearing a higher bar; short sentiment-bearing
  statements are mood reports and route to valence-matched fallbacks.

### Reply pipeline (pickReply)

Priority order per message (route names in parentheses):

1. Continuations (`cont:*`): short follow-ups ("why", "another one",
   "hahaha more") stay on the last scenario; leading interjections peel off
   first; with no topic on the table they get a light hand-back reply.
2. Exact regex per scenario (`regex:id`).
3. Name capture (`namecapture`): multi-turn window from the opening
   question; courtesy wrappers stripped; bare words must be outside the
   prototype vocabulary ("Thabo" passes, "busy" fails).
4. Strong fuzzy (`fuzzy-strong:id`), then keywords (`keyword:id`), then
   ELIZA (`eliza:n`), then weak fuzzy (`fuzzy-weak:id`) — all subject to the
   gates above.
5. Pending-question acknowledgment (`ack`): answers get acknowledged, with a
   negation-preserving echo of the user's words.
6. Memory callback (`callback`): junk-filtered topics only.
7. Graceful fallback (`clarify:*`): sentiment first, then gibberish/question/
   statement-echo deflections; the random pool (`pool:chat`) only fires right
   after a clarify, and never greets or says goodbye mid-conversation.

Answer pools rotate through shuffle-bags (`bagPick`) so no line repeats until
the pool is exhausted, never twice in a row. `{W}` fills with the user's name
or one nickname per message (capitalized at sentence starts); `{TOD}`/`{DAY}`
fill from the clock.

## UI (js/ui.js)

- Animation: fixed frame sequence (sentry, blink, look left/right, tail
  flick, duck) with per-frame hold times; respects `prefers-reduced-motion`.
- `fitArt()` scales the ASCII art to the viewport.
- Chat: user bubble, "..." typing indicator, reply after a 500–1200 ms delay.

## Evaluation

`eval/` simulates 100 seeded conversations x 100 messages against the
unmodified production brain and scores every response deterministically; an
LLM-judge protocol scores sampled transcripts. See `eval/README.md` and
`eval/results/HISTORY.md` for the metric progression. Run `node eval/run.js`.

## The clever brain (js/llm.js, v13 prototype)

Progressive enhancement: an on-device LLM composes Tsamma's replies,
grounded in the scripted brain. brain.js keeps running unchanged as router,
state machine (name, memory, pending questions) and instant fallback — the
page behaves exactly like v12 if no model ever loads, and any generation
failure falls back to the scripted reply for that turn.

- Backends: WebLLM over WebGPU for real users (tiers, largest first:
  Qwen3.5-9B ~6.4 GB VRAM, Llama-3.1-8B ~5.0 GB, Qwen3-4B ~3.4 GB,
  Qwen2.5-3B, Qwen3-1.7B, Llama-3.2-1B ~0.9 GB; each failure steps down);
  or any OpenAI-compatible local endpoint for development
  (?llm=<url>, auto-detected on localhost:8080).
- Per turn: pickReply() runs first (state advances, scripted reply
  produced), then the LLM gets the persona bible, the memory state, the
  last 8 turns, the user message, and a grounding note built from the
  scripted route: prepared material (jokes/stories) is delivered nearly
  verbatim, scenario answers are rephrased in context, clarify routes
  become "admit it's beyond your dune, never invent facts".
- Guardrails: 120-token cap, 30 s timeout, sanitizer (strips think-tags,
  roleplay asterisks, speaker labels; bans AI-self-reference; trims to
  chat length; rejects exact repeats) — every rejection returns the
  scripted reply; three consecutive failures switch back to classical.
- URL params: ?brain=classic, ?model=<webllm-id>, ?llm=<url>.

## Paradigm note: neural embeddings

A MiniLM sentence-embedding classifier (transformers.js) was benchmarked
against the classical TF-IDF classifier on the same prototypes and held-out
bank: 76.4% vs 64.6% top-1 intent accuracy, and much cleaner in/out-of-domain
separation (Youden J 0.82 vs 0.60). It was NOT integrated: it costs a ~25 MB
model download plus startup latency, which v11 deliberately eliminated. If
the site ever accepts a download, the right shape is progressive
enhancement: classical brain from millisecond zero, embedding scorer swapped
in when the model finishes loading in the background.

## History

Versions v1–v10 lived as separate HTML files, since removed (git history has
them). v10 used transformer embeddings + optional WebLLM; v11 replaced both
with the classical TF-IDF brain (instant start, fully offline). v12 split the
file into modules and reworked the brain: dialogue-state tracking, robust
name capture, graceful fallbacks instead of pool junk, typo bridging,
augmented coverage, and precision gates — quantified in
`eval/results/HISTORY.md`.
