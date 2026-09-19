# ATHENA Bench

Benchmark infrastructure under active evaluation. No smoke result supports a performance claim.

`pnpm bench:pair --case controlled-semantic-loop --dry-run` creates one counterbalanced control/treatment pair. Use `--replicates`, `--seed`, `--timeout`, `--model`, and `--dry-run` to make execution explicit. Live runs require `--confirm-live`. Runner limits experiments to 10 pairs and 20 agent runs.

Control has no ATHENA plugin or hooks in its isolated worktree. Treatment has only ATHENA V1 plugin installed. Both copies derive from same fixture fingerprint. Runs use OS-temporary worktrees outside repository discovery, then remove them unless `--preserve` is set. Raw outputs and events are redacted before storage. `bench/results/` and `bench/work/` are ignored.

Run `pnpm bench:analyze -- <experiment-id>` then `pnpm bench:report -- <experiment-id>` after an experiment.

See [benchmark methodology](../docs/benchmark-methodology.md).
