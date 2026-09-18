# Live Jev Demo

Set key in terminal only. Never write it to config or telemetry.

```bash
export TYPESAFE_API_KEY=...
athena doctor --live
athena mode balanced
opencode
```

Use safe prompt: `Fix a package.json typo. Inspect it, make only necessary change, then run focused validation.` For loop behavior, use `evals/fixtures/dependency-loop`; do not run destructive commands. `ATHENA_LIVE_TEST=1 pnpm test:live` makes one minimal Jev request and prints measured latency.
