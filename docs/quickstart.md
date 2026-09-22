# Quickstart

## Prerequisites

- Node 20 or later
- pnpm 10 or later
- `TYPESAFE_API_KEY` for real TypeSafe Jev judgments
- OpenCode for OpenCode integration

Clone repository, then install and build:

```bash
pnpm install --frozen-lockfile
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

Launch ATHENA with OpenCode and optional HUD:

```bash
pnpm athena
```

`pnpm athena` builds required packages, starts OpenCode with ATHENA runtime, and uses tmux for a side-by-side HUD when available. Without tmux, OpenCode still starts and launcher prints optional standalone HUD command.

The CLI package also supports project plugin setup:

```bash
node packages/cli/dist/index.js init
node packages/cli/dist/index.js doctor
```

`init` detects installed OpenCode major version and creates `.opencode/plugins/athena.ts`. OpenCode 1.18.31 is live tested. OpenCode 2.0.7 integration is covered by offline tests but has less live validation.

## Standalone HUD

```bash
pnpm hud
```

HUD listens on a local Unix socket. Set `ATHENA_HUD_SOCKET` only when a custom socket path is required.

## Experimental Codex adapter

Merge native Codex hooks without replacing existing handlers:

```bash
node packages/cli/dist/index.js init codex
node packages/cli/dist/index.js doctor codex
```

Codex adapter exists but is not production-tested for this release. Replan enters Codex developer/tool context, never a user message.

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

`test:live` makes network calls and is opt-in. Standalone System-2 probes use `ATHENA_SYSTEM2_*` variables or `OPENAI_API_KEY` and `OPENAI_MODEL`; normal OpenCode use does not require them.
