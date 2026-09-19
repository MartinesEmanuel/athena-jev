# Quickstart

## Requirements

- Node 20 or later
- pnpm 10 or later
- `TYPESAFE_API_KEY` for real Jev judgments

Clone repository, then install and build:

```bash
pnpm install
pnpm build
```

Set key in shell environment. Never commit it:

```bash
export TYPESAFE_API_KEY="..."
```

Run offline demo and diagnostics:

```bash
node packages/cli/dist/index.js demo
node packages/cli/dist/index.js doctor
```

## OpenCode

Install project plugin and inspect diagnostics:

```bash
node packages/cli/dist/index.js init
node packages/cli/dist/index.js doctor
```

`init` detects installed OpenCode major version and creates `.opencode/plugins/athena.ts`. OpenCode V1 uses `experimental.chat.system.transform`; V2 uses its context hook.

## Codex

Merge native Codex hooks without replacing existing handlers:

```bash
node packages/cli/dist/index.js init codex
node packages/cli/dist/index.js doctor codex
```

Codex invokes ATHENA hooks through its configured command handlers. Replan enters Codex developer/tool context, never a user message.

## Modes And Local Inspection

```bash
node packages/cli/dist/index.js mode balanced
node packages/cli/dist/index.js status
node packages/cli/dist/index.js events
node packages/cli/dist/index.js report
```

`shadow` records decisions without intervention. `guardian` enforces deterministic catastrophic rules and very-high-risk judgments. `balanced` enables configured policy control.

## Development Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
ATHENA_LIVE_TEST=1 pnpm test:live
```
