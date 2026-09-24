# ATHENA SWE-Bench Pro V2 harness

Official source: <https://github.com/scaleapi/SWE-bench_Pro-os>, V2.0.0 commit
`66f92766bba642462d4bbe5479e83f91f9211862`.

```sh
export SWE_BENCH_PRO_V2_ROOT=/path/to/SWE-bench_Pro-os
export ATHENA_BENCH_MODEL_PROVIDER=... ATHENA_BENCH_MODEL_ID=...
export ATHENA_BENCH_REASONING_EFFORT=...
pnpm benchmark:athena doctor
pnpm benchmark:athena pilot --dry-run
pnpm benchmark:athena final --dry-run
```

Live execution is deliberately gated by `--confirm-live`; it delegates to Harbor's
official locked agent/replay protocol and is not attempted by a dry run. Results are
append-only below `benchmarks/swebench-pro-v2/runs/` (ignored by git).
