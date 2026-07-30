# Changelog

Notable changes to MeerChat. Versioning is `v<major>.<minor>` (see
CLAUDE.md): the minor bumps on every change to the shipped site, and the
`?v=` cache-buster on the script tags always equals `VERSION` in
`js/brain.js`. Eval scores are tracked separately in
`eval/results/HISTORY.md`.

## v12.12 — 2026-07-30

- The stage gets a bit more height (46% → 52% of the viewport): the sky band
  grew the grid from 73 to 88 rows, which had shrunk the meerkat; she is now
  about the size she was before the scene landed. Checked at 980px and 390px.
- Documented the scene engine in `docs/ARCHITECTURE.md` (compositor contract,
  the stationary-floor corrections, sky clock, band splicing, scheduler, the
  route→action seam) and added `dev/README.md` with the headless-Chrome
  verification recipes and the sprite-drawing notes.

## v12.11 — 2026-07-30

- Ask Tsamma to dance and she does: "dance for me", "gooi a dansie" and
  friends route to a new `dance` scenario, and `js/ui.js` reads the route
  the brain took to trigger the matching scene animation. The brain stays
  presentation-agnostic — the route→action table lives in the UI, and is
  the same seam a future click/tap layer will use.
- The dance is built from band splices of the existing poses (head rows
  from look-left/right/blink, tail rows from the flick) plus per-beat sway
  and hop offsets that move the meerkat against a fixed dune. The frames
  are image-derived — every torso row is one continuous ink run with the
  paws shaded into the chest — so bands, not limbs, are the granularity
  this art supports.
- Fixes a ghost horizon the hop exposed: each frame has the dune line
  baked into its bottom rows, so lifting the meerkat dragged a second
  floor up the screen with her. Those dots are now stripped per pose
  (`katPose`) and the scene's ground layer is the only floor; the feet and
  shadow marks on the same rows stay with her.
- New `test/ui-wiring.test.js` runs `js/ui.js` for the first time, against
  a DOM stub and a controllable clock: boot, the idle lap, chat → route →
  dance, and the reduced-motion path. Eval unchanged at 77.8 overall.

## v12.10 — 2026-07-30

- Scenery: two camelthorn acacias on the dune, drawn as flat-crowned
  silhouettes with visible limbs converging on the trunk (an earlier pass
  read as wine glasses — a wide crown over a hairline stem needs branches
  to read as a tree). They use lighter glyphs than the meerkat's dense
  fills so they sit back as distant background.
- Sun and moon redrawn: the sun is a rayed disc, the moon a crescent with
  pointed horns, both legible at the ~4–8 px scene font size.
- Scene lab gained `?fs=` to render a sprite at a large font for detail
  review.

## v12.9 — 2026-07-29

- Scene engine: the stage is now a composed scene (`js/scene.js`, pure and
  Node-testable like brain.js) — z-ordered sprites blitted into one
  141×88 character grid: stationary ground, day/night sky (sun arc,
  moon + seeded stars from the real clock), and the meerkat as a
  bottom-anchored sprite. CSS phase palettes (`body[data-phase]`) shift
  the page ink/glow through dawn/day/sunset/night.
- Fixes the floor jumping up two rows whenever the duck frame played:
  the duck art was drawn with its baked ground line two rows higher than
  every other pose; it now gets a per-frame baseline offset and the scene
  draws its own dune line, pinned by a unit test across all poses.
- The idle animation runs through a pure, interruptible scheduler
  (`mkSched`/`schedStep`/`schedRequest`) instead of an uncancellable
  `setTimeout` chain — `runAction()` is the seam chat routes (and later
  pointer input) use to trigger animations like the dance.
- New dev-only scene lab (`dev/scenelab.html`): renders any sprite, pose,
  or animation step in isolation, with `?time=` clock override — never
  loaded by index.html.
- `fitArt()` measures the real glyph advance once (0.62 stays as the
  fallback) and sizes the new grid; art color/glow moved to CSS custom
  properties.

## v12.8 — 2026-07-29

- ui.js cleanup: the idle caption is a single `IDLE` constant (was written
  six times), the art's character grid is measured from the frames once
  (the hardcoded 144 columns was wrong — the widest frame is 141) instead
  of per resize, the reduced-motion path renders the still frame without
  entering the animation loop, and the typing bubble keeps a direct
  reference to its text node instead of relying on `lastChild` position.

## v12.7 — 2026-07-29

- brain.js structural pass, behavior-identical (eval byte-identical): the
  35-line name-capture window is its own `captureName()` function with
  `NOTNAMES`/`inVocab` hoisted to module scope and the fuzzy-routing
  check now computed lazily; the repeated statement-on-question-scenario
  predicate is named (`botqStatement`); the prototype token arrays no
  longer outlive the TF-IDF build; and the `__meer.probe()` dev tool uses
  the same typo-bridged tokenizer as real routing, so its scores finally
  match what the router sees.

## v12.6 — 2026-07-29

- brain.js dead-code pass, behavior-identical (eval byte-identical):
  unreachable awaitName branch and the never-emitted `myname` fallback
  answer removed, `TH` is const, the inner pipeline is no longer
  needlessly async (the public `pickReply` stays async), `bestMatch`
  drops its always-the-same parameter, `mem.lastRoute` is declared in the
  mem literal, and the stale v11 header prose is replaced with a current
  description.

## v12.5 — 2026-07-29

- brain.js internal cleanup, behavior-identical (eval byte-identical):
  the previous-message context (`lastUserMsg`) is recorded once in the
  `pickReply` wrapper instead of on each of 15 return paths, and a
  `clarify(kind)` helper replaces six duplicated route-and-draw pairs.

## v12.4 — 2026-07-29

- The themed fallback-pool categories (greet/bye/danger/weather/food),
  unreachable since the scenario system took over those topics, are merged
  into the answer pools of their matching scenarios (`greetscen`,
  `byescen`, `danger`, `weather`, `userfood`) at load time. Same routing,
  much deeper answer variety; repetition rate dropped 2.4% → 2.0%
  (HISTORY row 10).

## v12.3 — 2026-07-29

- `js/data/responses.js` restructured from a flat 1000-entry array of
  `{c, t}` objects into six category-grouped pools of plain strings
  (`R.chat`, `R.greet`, …), one line per entry. Structure only — eval
  output byte-identical.

## v12.2 — 2026-07-29

- The clever-brain prompt code (persona bible, prompt builder, sanitizer)
  now lives once in `js/llmShared.js` — classic script in the browser,
  CommonJS module in Node — replacing three hand-synced copies
  (`js/llm.js`, `eval/lib/llmShared.js`, `buildTsammaMessages` in
  `eval/llm_convo.js`). The LLM layer itself stays dormant: `index.html`
  loads no `llm*.js` and nothing is downloaded on page open (now enforced
  by a test).

## Unversioned (tests, eval tooling & docs)

- Eval-side cleanups: shared CLI parser, per-conversation transcript dumps,
  a Map-based intent lookup in the simulator, `llm_convo.js` output paths
  anchored to the repo (with the meta file no longer able to overwrite the
  transcript), and logged user-simulator failures. Output byte-identical.
- Docs: ARCHITECTURE.md documents the dual-load guard pattern, the
  category-grouped pool wire-in, the two-tier testing story and the
  two-tag clever-brain re-enable recipe; eval/README.md fixes the stale
  loadBrain description (protos.js was missing).

- New zero-dependency unit-test suite: `node --test test/`. Pins the
  brain's routing grammar, name capture, dialogue state, shuffle-bag
  guarantees, template hygiene and thresholds, plus static guards for the
  hard constraints (no DOM in brain.js, no modules in `js/`, no `llm*.js`
  in `index.html`, `?v=` equals `VERSION`).
- The eval brain sandbox additionally exports `bagPick`, `bags`, `R_CHAT`
  and `VERSION` for the tests.

## v12.1 — 2026-07-29

- Version/cache policy: script URLs carry `?v=<version>` so a freshly
  deployed `index.html` never runs against stale cached scripts; the
  status line was removed.

## v13 (prototype, parked)

- Optional on-device LLM layer (`js/llm.js`): WebLLM/WebGPU or a local
  OpenAI-compatible endpoint rewrites the scripted reply in persona, with
  the classical brain as router and instant fallback. Not wired into the
  page while parked.

## v12 — classical brain

- TF-IDF fuzzy classifier with typo bridge, scenario routing, dialogue
  state (pending questions, acks, continuations), name capture/recall,
  topic callbacks, graceful clarify fallbacks. Fully offline, zero
  downloads. See `docs/ARCHITECTURE.md`.
