# Benchmarks

No benchmark claims are published until measured experimentally.

`evals/schema.json` defines records for baseline agent and agent plus ATHENA. Track task success, tool calls, repeated and failed calls, high-risk calls, model tokens where available, Jev calls and latency, replans, premature completion, human intervention, and completion time.

`pnpm eval` loads four reproducible fixture definitions: dependency-loop, failing-test, risky-action, and straightforward-fix. It emits no result values and makes no benchmark claim. Store measured runs in `evals/results/` using the schema.
