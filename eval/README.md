# MeerChat evaluation harness

Quantifies chat quality by simulating full conversations against the
production brain (`js/brain.js`, loaded unmodified in a Node vm sandbox with
seeded RNG and a fixed clock — fully reproducible).

Run:

```
node eval/run.js                       # 100 conversations x 100 messages
node eval/run.js --convs 10 --msgs 50 --seed 7 --transcripts 3
```

## How it works

- `lib/loadBrain.js` loads `js/data/responses.js` + `js/brain.js` into a vm
  context per conversation (fresh memory), with `Math.random` seeded
  (mulberry32) and `Date` fixed, so every run is identical.
- `lib/simulator.js` is a seeded user simulator that reacts to the bot:
  it greets, gives a name, asks scenario questions, answers her questions,
  sends follow-ups after jokes/stories, makes smalltalk, drops out-of-domain
  messages, and says goodbye. Every message carries a ground-truth label.
- `data/bank.json` is a held-out message bank (~840 in-domain paraphrases
  across all 84 intents, 120 out-of-domain messages, reactive answers,
  continuations, smalltalk). Phrasings are deliberately NOT the brain's own
  prototype sentences: the eval measures generalization.
- `lib/metrics.js` scores every response in [0,1] from (message label, route
  that produced the reply, context). The rubric is frozen across brain
  versions so numbers stay comparable.

## Headline metrics

- `overall`         mean response score x 100 (higher is better)
- `intentAccuracy`  in-domain questions routed to an acceptable scenario
- `oodMisfireRate`  out-of-domain messages answered by an unrelated scenario
- `reactiveGoodRate` user answers to her questions handled as such
- `junkPoolRate`    replies drawn from the random 1000-line pool
- `repetitionRate`  verbatim repeated replies within a conversation
- `nameCaptureRate` / `nameRecallRate`  name memory across the conversation

Route provenance comes from `mem.lastRoute`, which the brain records for
every reply (also visible in the browser via `__meer.mem.lastRoute`).

Results live in `eval/results/` (baseline and one file per improvement).
