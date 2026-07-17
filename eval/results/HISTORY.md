# Metric progression

All rows: `node eval/run.js --convs 100 --msgs 100 --seed 12345` (10,000 scored
responses per row, deterministic; frozen rubric in eval/lib/metrics.js).

| Step | Overall | Intent acc | Reactive good | Junk pool | OOD score | Repetition | Name recall |
|---|---|---|---|---|---|---|---|
| Baseline (v11 split) | 44.1 | 34.4% | 10.5% | 54% | 38.7 | 1.2% | 38.3% |
| 1 Dialogue state: pending questions | 50.3 | 34.3% | 59.9% | 42.4% | 39.2 | 1.1% | 32.8% |
| 2 Robust name capture | 50.7 | 34.2% | 60.2% | 42.7% | 38.8 | 1.3% | 74.1% |
| 3 Graceful fallbacks replace pool junk | 60.9 | 33.2% | 60.2% | 3.6% | 65.5 | 4.8% | 84.2% |
| 4 Classifier: coverage+typo bridge+gates | 76.7 | 58% | 91.1% | 1.4% | 72.5 | 1.2% | 94.6% |
| 5 Flow polish: continuations, slang | 77.2 | 59.5% | 90.9% | 1.5% | 72.4 | 1.2% | 94.3% |
| 6 Live-probe routing fixes | 76.9 | 60.3% | 87.4% | 2.6% | 74.1 | 1.9% | 93% |
| 7 Judge-driven precision pass | 77.9 | 60.8% | 89.6% | 2.5% | 73.8 | 1.6% | 94.8% |
| 8 Fresh-eyes review fixes (v12) | 76.7 | 57.5% | 89.9% | 2.1% | 72.2 | 1.8% | 89.5% |
| 9 Final judge-flagged fixes | 77.8 | 60.2% | 87.8% | 2.4% | 74.9 | 2.4% | 96.4% |

LLM-judge (5 transcripts x 3 judges, fixed rubric, scores /5):

| Round | Coherence | Persona | Engagement | Junk % | Verdicts |
|---|---|---|---|---|---|
| Baseline | 2.28 | 4.52 | 2.76 | 41.9 | 15 mixed |
| After step 5 | 3.17 | 4.62 | 3.24 | 17.5 | 12 mixed, 3 coherent |
| Final (v12) | 3.25 | 4.62 | 3.18 | 21.3 | 10 mixed, 5 coherent |

Caveat: the final rubric round mixed 50- and 100-message transcripts, so its
numbers are directional; the baseline and mid rounds used 100-message ones.

50-message goal check (3 conversations x 3 judges, seed 777): 9/9 PASS,
mean 5.7 junk exchanges per 50 (~89% coherent). Judges' summary: "consistent
persona, name memory, real multi-turn threads and in-character deflections
keep the whole 50 messages feeling coherent rather than random."

Paradigm benchmark (classifier only, 840 held-out messages + 120 OOD):
MiniLM embeddings 76.4% top-1 / OOD-separation J=0.82 vs classical TF-IDF
64.6% / J=0.60. Not integrated (25 MB download vs zero-download design).
