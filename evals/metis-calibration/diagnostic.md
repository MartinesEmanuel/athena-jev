# METIS Pre-Change Diagnostic

Date: 2026-09-18. Source: `evals/results/2026-09-18-live-phase3.json`.

All 20 prior labels reconcile: 10 stagnation loops were false negatives; 4 stagnation progress cases were true negatives; 2 stagnation cases were ambiguous; 2 AEGIS cases and 2 NIKE cases were not applicable to METIS. No provider errors occurred.

Existing METIS state used normalized commands, truncated output, and no explicit repeated-error or strategy-family feature. Provider asked four questions. Policy required both `sameStrategy >= 0.88` and `strategyChangeNeeded >= 0.90`. Real loop scores had `sameStrategy` 0.90-0.92 but `strategyChangeNeeded` 0.71-0.74. This conjunction caused all ten false negatives. Dependency-loop telemetry also mixed package retries with repeated tests and did not expose same-error evidence strongly enough.
