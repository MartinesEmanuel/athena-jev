# Live Evaluation

`evals/jev/cases.json` contains 20 human-authored qualitative labels. It is a dataset foundation, not calibration evidence.

Run live probes only with a configured key:

```bash
athena doctor --live
athena probe semantic-loop
athena probe real-progress
athena probe safe-action
athena probe ambiguous-action
athena probe premature-completion
```

Store redacted measured runs in `evals/results/`. Preserve predicted probabilities, human labels, model, latency, fixture, and mode. Tiny samples cannot establish calibration; use them only to inspect threshold tradeoffs, false positives, false negatives, Brier score, and reliability curves later.

`evals/results/2026-09-18-live-phase3.json` contains one real TypeSafe Jev run. It has 20 labeled cases and two OpenCode fixture sessions. It is observational, not statistically significant.
