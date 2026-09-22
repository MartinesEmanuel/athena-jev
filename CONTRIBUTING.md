# Contributing

Use Node 20+ and pnpm 10+.

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Keep changes focused. Add offline tests for behavior changes. Live provider tests are opt-in: `ATHENA_LIVE_TEST=1 pnpm test:live` requires a locally supplied key and must not run in normal CI.

Never commit provider keys. Do not store chain-of-thought. Do not inject ATHENA control as a synthetic user message.

`@athena/core` must remain provider-independent. Provider SDK imports belong outside core. Policy decisions belong in ATHENA deterministic code; Jev supplies bounded semantic judgment and never executes tools.

## Adapter Contributions

Adapters must declare truthful capabilities, normalize native actions/results, use canonical telemetry and session state, pass compliance tests, redact secrets, and never inject ATHENA as a user. Add live proof when host runtime supports automation. Do not place host schemas or provider implementation in `@athena/agent-sdk`.
