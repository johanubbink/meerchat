# MeerChat architecture

MeerChat is a fully offline, dependency-free chatbot: Tsamma, a meerkat sentry
in the Kalahari, chats in South African English. Hosted as a static site on
GitHub Pages (meerchat.co.za). No network calls, no build step; it must keep
working when opened directly from disk (`file://`).

## File layout

```
index.html          shell: markup + script tags, loaded in order
css/style.css       all styling (desert theme, chat bubbles, input bar)
js/data/frames.js   ASCII-art meerkat poses (F), 141x73 each
js/data/sprites.js  scene sprites (SPR: sun, moon, trees, star, bird),
                    extra poses as band splices (FD), and the meerkat
                    rig (RIG: carve masks, part art, pose configs)
js/data/responses.js  generic fallback pool (R), grouped by category; the
                      themed categories feed scenario answer pools
js/data/protos.js   extra prototype sentences + keywords per scenario (data)
js/brain.js         all chat logic, no DOM access (testable in Node)
js/llmShared.js     clever-brain prompt code shared with the eval (persona
                    bible, prompt builder, sanitizer; pure functions)
js/llm.js           clever brain: optional on-device LLM layer (v13, not loaded)
js/scene.js         scene engine: ASCII compositor, sky clock, animation
                    scheduler — pure, no DOM (testable in Node)
js/ui.js            DOM wiring: scene painting, art scaling, chat bubbles
dev/scenelab.html   dev-only sprite/pose/animation viewer (never shipped)
test/               node:test suite pinning brain behavior (node --test test/)
```

Scripts are classic (non-module) tags so `file://` keeps working. Two files
use a dual-load guard so the same source runs in the browser and in Node:
`js/brain.js` never touches `document`/`window` except to export
`window.__meer` when a window exists (the eval and the unit tests load it in
a bare vm), and `js/llmShared.js` and `js/scene.js` end with a `module.exports` tail that
is inert in the browser and makes them CommonJS modules under `require()`.

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
- `R`: 1000 generic replies grouped by category. The neutral `chat` pool is
  the rare variety valve behind the fallback chain (`pool:chat`); the themed
  categories (greet/bye/danger/weather/food) are merged into the answer
  pools of their matching scenarios at load time, deduplicated so the
  shuffle bags keep their no-repeat guarantee.
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

## Scene engine (js/scene.js)

The stage is a composed scene, not a single art string. `js/scene.js` holds the
whole model and is pure: no DOM, no timers, no `Math.random`, no clock of its
own (the date is passed in), so the unit tests drive it directly.

**Compositor.** A scene is a list of sprites `{art, x, y, z}` blitted into one
`GRID.cols x GRID.rows` (141x88) character grid and joined to a single string,
which `ui.js` writes with one `textContent` assignment. In sprite art a space
is transparent and `~` is an opaque space (`~` is outside the frames' charset
`# ' * + - . : = @ ^`). `blit` clips on all four edges, so a sprite may hang
off the grid — that is how the sun rises through the left edge. Z-order is
ground 0, stars 1, sun/moon 2, trees 5, meerkat 10. Every tick rebuilds the
whole grid; at ~12 KB and roughly 1–7 writes/second there is nothing to
optimise, and no `requestAnimationFrame` loop.

**The meerkat and the stationary floor.** The six generated poses in
`frames.js` are used verbatim as one bottom-anchored sprite. Two corrections
are applied on the way in:

- `KAT_DY` — the `duck` frame was drawn with its ground line two rows higher
  than every other pose, which made the floor visibly jump. It is blitted two
  rows lower so every pose shares one baseline.
- `katPose()` — each frame has the dune line *baked into* its bottom rows
  (`KAT_GROUND_ROWS`). Those dots are stripped so the scene's ground layer is
  the only floor; the feet and shadow marks on the same rows are kept, since
  they belong to the meerkat and should travel with her. Without this, any
  vertical move (the dance's hop) drags a second horizon up the screen.

`test/scene.test.js` pins the result: composing every pose, and every step of
the dance with its offsets, must leave the dune line on exactly the same two
grid rows.

**Sky clock.** `skyState(date)` returns a phase — `dawn` / `day` / `sunset` /
`night`, banded to match the brain's `tod()` — plus a sun position on a
parabolic arc (06:00–19:00), a moon on the night arc, and a star field seeded
by day-of-year with mulberry32, so the stars are fixed for a given night and
differ the next. `ui.js` copies the phase to `body[data-phase]`; the palette
(ink, glow, sky gradient) is CSS custom properties, so day/night is a
page-wide colour shift rather than per-cell colour in the grid.

**Poses beyond the six.** The frames are image-derived: every torso row is a
single continuous ink run, with the paws shaded into the chest, so limbs
cannot be separated by column. They do differ in clean horizontal bands (head
rows 0–16, tail rows 54–70), so `spliceRows()` composes new poses from bands
of existing ones — the dance poses in `FD` are a head band from
look-left/right/blink over a tail band from the flick. `expandFrames()` merges
them into `F` at load; it also accepts plain row deltas (`sleep` is duck with
the eye row shut).

**The rig (v12.13).** Beyond bands, two more seams turned out to be usable:
the tail is a *detached* diagonal right of the skirt — the skirt never
crosses col 90 — so `carvePart()` can cut it out by rect mask (and the part
remembers its anchor, so re-blitting it is the identity, which a test pins);
and the canvas beside the torso is empty at shoulder height, so new arms are
*additive* overlay sprites (wave, cheer, point) drawn in the frames' charset.
Because the resting arms are baked into the chest as the `-` shading flanking
the `#` patch (rows 20–33), a raised arm must ride an *armless* base —
`sentry_noarm_l/r/both` in `FD` — otherwise the pose grows extra arms; a test
pins this. The folded arms occlude the upper taper of the dark belly ellipse
(fully visible at rows 34–47), so those bases *reveal* it rather than paint
flat fur: row deltas generated from the frame itself extend the `#` patch to
the belly contour (linear taper from the chest span to the belly span), with
the usual `*`/`+` boundary glyphs and the silhouette edges kept. A rig pose
config (`RIG.poses` in `js/data/sprites.js`) is a base frame + optional head
band + optional tail swap (erase the tail rect, blit a replacement tail:
up/down for the wag) + overlays; `expandRig()` composes each config into `F`
at load with the same
`makeGrid`/`blit` primitives the scene uses, so downstream code — `katPose`,
the scheduler, the scene lab's `?frame=` — treats rig poses as ordinary
frames. Rows 71–72 (baked feet/ground marks) are never composed over.

**Ambient events.** `ambient(date, phase, SPR)` adds rare sky visitors: a
shooting star at night, a bird flyby by day. Each minute is seeded on its own
calendar identity (mulberry32 again), a lucky minute gets one event at a
seeded start second, and the sprite's position is a pure function of the
seconds hand — successive renders animate it with no stored state. The bird
returns `event: "bird"` while overhead (cols 48–92); `ui.js` turns that into
a `duck_react` scene action when the sentry is idling. `renderFrame(...,
opts)` takes `{ambient: false}` for the reduced-motion still.

**Scheduler.** Pure state machine: `mkSched()`, `schedStep(state, phase?)` and
`schedRequest(state, action)`. Steps are `[frame, caption, holdMs, dx, dy]`,
where `dx`/`dy` shift only the meerkat — the scenery and the dune stay put,
which is what makes the dance's sway and hop read as movement. `ANIMS.idle`
loops; any other animation plays once and falls back to idle step 0.
At night (`phase === "night"`) the idle table is swapped for `idle_night` —
the nap: sleep pose, long holds, the odd startle — while `state.mode` stays
`"idle"`, so dawn wakes her with no transition bookkeeping (the step index
clamps when the tables' lengths differ). Duplicate requests for the animation
already playing, and unknown names, are dropped. `ui.js` owns the single
timer, so an action never spawns a second animation chain (the pre-v12.9 loop
was an uncancellable `setTimeout` chain). `DANCES` lists the four dance
animations (`dance`, `dance_bounce`, `dance_moonwalk`, `dance_flourish`);
the random pick per dance request happens in `ui.js` — `Math.random` stays
banned in the engine.

## UI (js/ui.js)

- Paints the scene: `draw()` calls `scene.renderFrame(new Date(), pose, F,
  SPR, off)` and assigns `art.textContent` plus `body.dataset.phase`.
- One `loop()` driven by `schedStep`; `runAction(name)` queues a scene
  animation. Under `prefers-reduced-motion` there is no loop at all — a still
  composed scene, refreshed every 30 s so the sky still follows the clock, and
  `runAction` is a no-op.
- `ROUTE_ACTIONS` maps the route the brain just took to a scene animation:
  dance routes draw a random member of `S.DANCES`, greetings and goodbyes
  (`greetscen`/`byescen`) wave, jokes earn a cheer, and `danger` routes
  (reported sightings: "I see a bird", "is that a hawk?") duck for cover.
  An entry's action may be a string or a function returning one (the dance
  pick). The brain stays presentation-agnostic; this table is also the seam
  a future pointer/tap layer will call `runAction()` through.
- `fitArt()` solves the font size so the grid fits `min(bodyWidth-8, 760)` by
  40% of the viewport height, clamped to 3–10 px. The glyph advance ratio is
  measured once from a probe span (0.62 is the fallback); the 1.02 factor
  mirrors `line-height` in `css/style.css`.
- Chat: user bubble, "..." typing indicator, reply after a 500–1200 ms delay.

## Dev: the scene lab (dev/scenelab.html)

Dev-only, never loaded by `index.html` (the static guards pin that page's
script list). It renders one sprite, pose, or animation step in isolation from
`file://`, which is how the sprites were iterated on and how the floor fix was
verified. Query params: `?sprite=` / `?frame=` / `?anim=` with `?step=N`
(deterministic, no timers) or `?play=1` (live), `?time=HH:MM` to override the
clock, `?fs=N` for a large font, `?grid=1` for a row/col ruler, `?bare=1` to
drop the info line. See `dev/README.md` for the headless-Chrome screenshot and
screencast commands.

## Testing & evaluation

Two tiers:

- **Unit tests** (`node --test test/`, zero dependencies, ~2 s): pin the
  brain's behavior — the `mem.lastRoute` grammar, greeting/OOD/continuation
  routing, name capture and recall, the pending-question state machine,
  shuffle-bag guarantees, template hygiene, memory caps and thresholds —
  plus static guards for the hard constraints (no DOM in brain.js, no
  modules in `js/`, no `llm*.js` script tag in `index.html`, every `?v=`
  equal to `VERSION`). They reuse `eval/lib/loadBrain.js`, so they exercise
  the same seeded vm sandbox as the eval. Two of them cover the visual layer:
  `test/scene.test.js` pins the compositor, the sky phases, the rig
  (carve identity, pose invariants), the ambient determinism, the scheduler
  and the stationary-floor invariant (over every pose and every animation
  step), and `test/ui-wiring.test.js` runs the real `js/ui.js` against a DOM
  stub and a controllable clock that also drives `Date` (boot, the idle lap,
  chat → route → dance/wave/cheer, the night nap, the bird flyby, reduced
  motion) — the only automated coverage of the page's script load order and
  of interaction, which headless screenshots cannot exercise.
- **Scored eval** (`eval/`): simulates 100 seeded conversations x 100
  messages against the unmodified production brain and scores every response
  deterministically against a frozen rubric; an LLM-judge protocol scores
  sampled transcripts. See `eval/README.md` and `eval/results/HISTORY.md`
  for the metric progression. Run `node eval/run.js`.

## The clever brain (js/llm.js, v13 prototype)

**Currently dormant: `index.html` does not load `js/llm.js`**, so visitors
get the classical v12 brain and download nothing. The auto-download of
multi-GB WebLLM weights on page load was too heavy to ship enabled. To
re-enable, add TWO tags between `brain.js` and `ui.js` in `index.html` —
`<script src="js/llmShared.js?v=...">` then `<script src="js/llm.js?v=...">`
(ui.js prefers `getReply()` when it exists) — and update the expected
script-tag list in `test/static-guards.test.js`, which otherwise fails the
build on any `llm*.js` tag by design.

The prompt-building and sanitizing code lives in `js/llmShared.js` and is
the exact code the Node eval harness (`eval/llm_convo.js`) runs — the E2E
eval exercises the production prompt by construction.

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
