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
js/brain.js         all chat logic, no DOM access (testable in Node)
js/ui.js            DOM wiring: animation loop, art scaling, chat bubbles
```

Scripts are classic (non-module) tags so `file://` keeps working. `js/brain.js`
never touches `document`/`window` except to export `window.__meer` when a
window exists, so Node tests can load it directly.

## The brain (js/brain.js)

State lives in `mem`: user name, turn count, last scenario, pending-question
flag, up to 3 remembered topics, short history.

### Knowledge

- `SCEN`: ~84 scenarios. Each has an `id`, answer pool `a`, and up to three
  ways to be matched: `re` (exact regex), `protos` (prototype sentences for
  fuzzy matching), `kw` (keyword substrings). Optional: `more` (continuation
  parts, e.g. multi-part stories), `asks` (marks that Tsamma asked the user a
  question), `dyn` (dynamic answer function, e.g. recalling the user's name).
- `R`: 1000 generic replies tagged `chat`/`greet`/`food`/`danger`/`weather`/
  `bye` — the last-resort pool.
- `ELIZA`: classic reflection rules ("i feel X" → "Why do you feel X?") with
  pronoun swapping (`REFLECT`).

### Intent classifier

Classical information retrieval: prototype sentences from every scenario are
tokenised (stopword removal, contraction expansion, small thesaurus `SYN`,
light suffix stemming) and embedded as TF-IDF vectors. A user message is
scored by cosine similarity against every prototype; thresholds `TH.strong`
(0.55) and `TH.weak` (0.40) gate how the match is used. Very short messages
that match nothing are re-scored joined with the previous message (context
boost). `__meer.probe("text")` in the console shows the top matches.

### Reply pipeline (pickReply)

Priority order per message:

1. **Continuation**: short follow-ups ("why", "really", "another one") stay on
   the last scenario; serve its `more` parts or another answer.
2. **Exact regex** per scenario.
3. **Name capture**: if Tsamma just asked the user's name, a short non-question
   reply is treated as the name (guarded by a not-names list, keyword and
   fuzzy checks).
4. **Strong fuzzy match** (score ≥ 0.55).
5. **Keyword hit** (most keyword substrings found).
6. **ELIZA reflections**, then **weak fuzzy** (score ≥ 0.40).
7. **Pending-question acknowledgment**: if Tsamma asked something last turn,
   acknowledge the answer, sometimes echoing the user's last few words.
8. **Memory callback**: occasionally circle back to a remembered topic.
9. **Sentiment + pool**: sentiment prefix (word lists `POS`/`NEG`) + a line
   from `R`, sometimes echoing the user or appending a follow-up question.

Answer pools rotate through shuffle-bags (`bagPick`) so no line repeats until
the whole pool is used, and never twice in a row.

Personality glue: `{W}` placeholders fill with the user's name or a random
chommie word; `{TOD}`/`{DAY}` fill with time-of-day/day name; some personal
answers bounce the question back ("same question back at you") to keep the
conversation two-way.

## UI (js/ui.js)

- Animation: a fixed `seq` of frames (sentry, blink, look left/right, tail
  flick, duck) with per-frame hold times; respects `prefers-reduced-motion`.
- `fitArt()` scales the ASCII art to viewport width/height.
- Chat: input + send button; user bubble, "..." typing indicator, then the
  brain's reply after a 500–1200 ms fake typing delay.

## Evaluation

`eval/` contains a Node harness that simulates conversations against the brain
and scores them; see `eval/README.md`. Run `node eval/run.js`.

## History

Versions v1–v10 lived as separate HTML files (`index2.html` … `index5.html`,
`tsamma-v9.html`), since removed; git history has them. v10 used transformer
embeddings (transformers.js) and an optional WebLLM generative fallback; v11
removed both in favour of the classical TF-IDF brain to get instant startup
and full offline operation.
