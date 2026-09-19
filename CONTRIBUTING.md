# Contributing

Use Node 20+ and pnpm.

```bash
pnpm install
pnpm check
```

Keep changes focused. Add tests for behavior changes. Preserve deterministic safety protections, frozen v0.1 METIS behavior, and local-first privacy. Discuss new agent adapters or policy changes in an issue before broad implementation.

## Adapter Contributions

Adapters must declare truthful capabilities, normalize native actions/results, use canonical telemetry and session state, pass compliance tests, redact secrets, and never inject ATHENA as a user. Add live proof when host runtime supports automation. Do not place host schemas or provider implementation in `@athena/agent-sdk`.
