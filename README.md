# ATHENA

Give coding agents reflexes.

ATHENA is an independent open-source cognitive control layer for coding agents powered by TypeSafe Jev.

```text
System 2 / LLM
      |
Candidate action
      |
ATHENA System 1
      |
TypeSafe Jev
      |
AEGIS / METIS / NIKE / EPISTEMICS
      |
CognitivePolicy
      |
GO / DELIBERATE / VERIFY / BLOCK
      |
Tools or System-2 reconsideration
```

LLM thinks. Jev judges. ATHENA controls. Tools execute.

## Cognitive domains

- **AEGIS**: risk and safety.
- **METIS**: progress, information gain, and stagnation.
- **NIKE**: completion, evidence, and unresolved obligations.
- **EPISTEMICS**: uncertainty, context sufficiency, and contradiction.

Jev returns bounded, typed judgments. Deterministic `CognitivePolicy` remains control authority. Jev never executes tools.

## Decisions

- **GO**: allow current action.
- **DELIBERATE**: stop current action and ask System 2 to reconsider its strategy.
- **VERIFY**: require evidence before proceeding or claiming completion.
- **BLOCK**: prevent unsafe action.

## Quick start

Requirements:

- Node.js 20 or later
- pnpm 10 or later
- `TYPESAFE_API_KEY` for real Jev judgments
- OpenCode for OpenCode integration

```bash
git clone https://github.com/MartinesEmanuel/athena-jev.git
cd athena-jev
pnpm install --frozen-lockfile
pnpm build
export TYPESAFE_API_KEY="..."
pnpm athena
```

`pnpm athena` starts OpenCode with ATHENA cognitive runtime and HUD launcher. `pnpm athena:opencode` starts same launcher without tmux orchestration. Run `pnpm hud` separately for HUD only.

Offline validation needs no provider key:

```bash
pnpm test
```

See [quickstart](docs/quickstart.md) for CLI setup details.

## HUD

HUD is optional local observability.

```bash
pnpm hud
pnpm athena
```

```text
CognitiveRuntime
      |
redacted AthenaHudSnapshot
      |
local Unix socket
      |
standalone HUD
```

Snapshots are push-based and local only. HUD does not poll. HUD failures never break cognition. ATHENA sends no prompts, provider responses, or reasoning to HUD. When `tmux` is available, `pnpm athena` can open side-by-side HUD; tmux is optional.

## Host support

| Host | Status |
| --- | --- |
| OpenCode 1.18.31 | Live tested. V1 plugin integration. |
| OpenCode 2.0.7 | Adapter present and covered by offline tests; less live validation than 1.18.31. |
| Codex | Experimental adapter package. Not production-tested for this release. |
| Cursor | Experimental research adapter. Not public CLI support. |

OpenCode does not expose supported interception of final textual completion. Completion enforcement is strongest around exposed tool actions.

## Project status

- Current stage: early experimental open-source release.
- Core architecture: working.
- Real Jev: working.
- OpenCode live integration: working for 1.18.31.
- HUD: working.
- Performance benefit: under evaluation.

## Repository structure

- `packages/core`: provider-independent cognitive contracts, policy, and reducer.
- `packages/typesafe`: TypeSafe Jev System-1 and standalone System-2 bridge.
- `packages/opencode`: OpenCode integration and runtime.
- `packages/hud`: standalone cognitive HUD.
- `packages/hud-protocol`: redacted HUD snapshot contract.
- `packages/agent-sdk`: host-independent adapter contracts.
- `packages/codex`: experimental Codex adapter.
- `packages/cursor`: experimental Cursor adapter.
- `packages/cli`: ATHENA CLI.

## Current limitations

- Jev adds network latency to each cognitive cycle.
- HUD is a standalone sidecar, not a native host sidebar.
- Host validation is strongest for OpenCode 1.18.31.
- ATHENA makes no claim of universal agent performance improvement.

## Documentation

- [Architecture](docs/architecture.md)
- [Adapters](docs/adapters.md)
- [Security model](docs/security-model.md)
- [Contributing](CONTRIBUTING.md)
- [Roadmap](docs/roadmap.md)

## Independence

ATHENA is independent open-source software. TypeSafe Jev is a dependency/service used by ATHENA. ATHENA is not an official TypeSafe or OpenCode product and does not imply endorsement, partnership, employment, or affiliation.

## License

MIT. See [LICENSE](LICENSE).
