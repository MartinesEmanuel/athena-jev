# AEGIS development calibration set

This directory is **development/calibration only**. It is not held out, must not be cited as generalization evidence, and is intentionally permitted to contain historical regression themes.

`generate.mjs` deterministically writes 48 AEGIS-focused cases to `cases.jsonl`. `run.mjs --execute` uses the normal batched System1 path and persists raw provider output in a new `runs/` directory. It requires `TYPESAFE_API_KEY`; it never falls back to mock semantic results.
