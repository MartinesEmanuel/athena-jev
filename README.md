# ATHENA

## Give coding agents reflexes.

ATHENA is an independent open-source reflex and control layer for coding agents powered by TypeSafe Jev. It observes actions and results, applies deterministic safety rules, asks Jev for compact semantic judgment when needed, and lets ATHENA policy decide control.

```text
LLM thinks. Jev judges. ATHENA controls. Tools execute.
```

```text
                    ATHENA CORE
          Rules + Jev + Policy + State
                         |
                 Agent Adapter SDK
                         |
              +----------+----------+
              |                     |
          OpenCode                Codex
           V1 / V2
```

## Why?

Coding agents can repeat failed strategies, take unnecessary risks, or claim completion without enough evidence. ATHENA adds a fast System One control layer around observable agent behavior.

## Reflexes

- **AEGIS:** risk reflex. Deterministic rules handle known catastrophic actions; Jev evaluates ambiguous risk.
- **METIS:** progress, stagnation, and semantic-loop reflex. Detects repeated underlying strategies, not only repeated strings.
- **NIKE:** completion reflex. Evaluates whether completion evidence is sufficient where adapter hooks permit observation.

Jev produces semantic judgment. ATHENA policy remains control authority. Jev never executes tools.

## Supported Agents

| Runtime | AEGIS | METIS | REPLAN | Live validated |
| --- | --- | --- | --- | --- |
| OpenCode V1 `1.18.31` | yes | yes | system context | yes |
| OpenCode V2 `2.0.7` plugin API | yes | yes | context hook | yes |
| OpenAI Codex CLI `0.154.0` | yes | yes | privileged developer/tool context | yes |

**Experimental:** Cursor adapter code remains isolated for research. Cursor adapter is experimental and is not part of ATHENA v0.1 verified support. Claude Code is planned.

## Quick Start

Requirements: Node 20+, pnpm, and `TYPESAFE_API_KEY` for real Jev.

```bash
pnpm install
pnpm build
export TYPESAFE_API_KEY="..."

# OpenCode
node packages/cli/dist/index.js init
node packages/cli/dist/index.js doctor

# Codex
node packages/cli/dist/index.js init codex
node packages/cli/dist/index.js doctor codex
```

Do not commit `TYPESAFE_API_KEY`. Full setup: [quickstart](docs/quickstart.md).

## Demo

Run `node packages/cli/dist/index.js demo` for deterministic offline output. The `controlled-semantic-loop` evaluation fixture repeats a failing test with superficial variations; METIS can request REPLAN, then asks agent to reassess root cause rather than prescribe a fix.

## Architecture And Security

- [Architecture](docs/architecture.md)
- [Adapters](docs/adapters.md)
- [Security model](docs/security-model.md)
- [Replan lifecycle](docs/reflexes.md)
- [Evaluation](docs/evaluation.md)

ATHENA persists redacted local JSONL telemetry under `.athena/events.jsonl`. Tool input, tool output, repository content, and MCP output are untrusted. Read security model before using ATHENA for consequential work.

## Benchmarks

Live adapter proofs and constructed calibration evidence exist. Large comparative benchmarks are next research phase. ATHENA publishes no ATHENA-versus-baseline improvement claims yet. See [benchmarks](docs/benchmarks.md).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). New adapters need capability declarations, normalization, compliance tests, canonical telemetry, no synthetic user control messages, and live proof when runtime permits it.

## Roadmap

- Comparative benchmark suite and ablation studies
- Cross-model evaluation
- `athena watch`
- Adaptive reflex budgets
- Additional adapters
- Claude Code adapter

## Independence

ATHENA is independent open-source software built using TypeSafe Jev. It is not an official TypeSafe product and does not imply TypeSafe endorsement, partnership, employment, or affiliation.

## License

MIT. See [LICENSE](LICENSE).
