# Changelog

Notable changes to MeerChat. Versioning is `v<major>.<minor>` (see
CLAUDE.md): the minor bumps on every change to the shipped site, and the
`?v=` cache-buster on the script tags always equals `VERSION` in
`js/brain.js`. Eval scores are tracked separately in
`eval/results/HISTORY.md`.

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

## Unversioned (tests & eval tooling)

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
