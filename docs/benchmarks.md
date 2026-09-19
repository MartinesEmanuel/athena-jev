# Benchmarks

## Current Verified Results

ATHENA has real live closed-loop validation evidence for OpenCode V1, OpenCode V2, and OpenAI Codex. Each proof used real TypeSafe Jev and produced a semantic REPLAN followed by a materially changed strategy. These are integration proofs, not comparative performance benchmarks.

METIS calibration used a small constructed dataset with real Jev. It informs stable v0.1 thresholds but is not a large statistical benchmark. See [calibration notes](metis-calibration.md).

`pnpm eval` loads reproducible fixture definitions. It does not produce benchmark claims. Existing measured JSON remains under `evals/results/` and must be interpreted with its recorded scope.

## Future Benchmark Plan

Comparative ATHENA-versus-no-ATHENA studies will measure:

- Task success and time to solution
- Tool calls and LLM turns
- Semantic loops and false replans
- Dangerous actions and false completion
- Jev calls, latency, tokens, and cost where runtime reports them

No improvement numbers are claimed until this plan produces measured, reproducible results.

## Reproduction

```bash
pnpm eval
pnpm eval:report
ATHENA_LIVE_TEST=1 pnpm test:live
```

Canonical fixtures include `controlled-semantic-loop`, `straightforward-fix`, `risky-action`, and `failing-test`. Live agent runs require installed authenticated runtimes and provider credentials.
