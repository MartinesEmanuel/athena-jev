# ATHENA

![CI](https://github.com/athena-jev/athena-jev/actions/workflows/ci.yml/badge.svg) ![MIT License](https://img.shields.io/badge/license-MIT-blue.svg) ![Node 20+](https://img.shields.io/badge/node-%3E%3D20-339933.svg) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6.svg)

### Give coding agents reflexes.

LLMs are good at thinking.

They're surprisingly bad at noticing when they're repeating themselves, when an action is a bad idea, and when task isn't actually finished.

ATHENA is a reflex runtime for coding agents. It adds a System One reflex layer using TypeSafe Jev.

```text
LLM     deliberate reasoning
Jev     fast semantic judgment
ATHENA  policy + control
```

GPT thinks. Jev judges. ATHENA decides. Tools execute.

```text
Coding Agent
     │
     ▼
   ATHENA
     │
 ┌───┼─────────────┐
 │   │             │
Rules Jev        Policy
 │   │             │
 └───┼─────────────┘
     ▼
ALLOW / ASK / DENY / REPLAN
```

```text
$ athena demo
ATHENA demo
provider: demo (no TypeSafe API call)

AEGIS  safe action      ALLOW  risk 18%
AEGIS  risky command    DENY   hard rule
METIS  semantic loop    REPLAN same strategy 96%
NIKE   completion gate  REPLAN continue 93%
```

## Why?

Your coding agent has a powerful brain. ATHENA gives it reflexes.

Deterministic code handles known danger. Jev supplies compact probabilistic semantic judgments. Policy decides; Jev never executes tools.

## Install

```bash
pnpm add -D athena-jev @athena/opencode
athena init
athena doctor
```

Set `TYPESAFE_API_KEY` for real Jev. Default `shadow` mode records would-be interventions without blocking work.

## Quickstart

```bash
athena init
athena mode balanced
athena demo
```

`init` creates `.athena/config.json` and `.opencode/plugins/athena.ts`. `athena init codex` merges native Codex hooks. Read [adapter support](docs/adapters.md).

## Reflexes

- **AEGIS / risk:** hard rules deny catastrophic commands. Jev evaluates relevance, scope, unintended change, approval need.
- **METIS / progress and stagnation:** observes results and asks if semantically similar strategy repeats without new information. Replan state carries into OpenCode session compaction context.
- **NIKE / completion:** evaluates completion evidence. OpenCode exposes no direct completion-attempt hook, so v0.1 evaluates this through adapter API and documents no unsupported completion interception.

### Loop Killer

Demo-provider output, not benchmark evidence:

```text
pnpm install
pnpm install --force
rm -rf node_modules && pnpm install
pnpm install --legacy-peer-deps

ATHENA / METIS
same strategy          96%
new information         8%
strategy change        93%
REPLAN
```

## Modes

- `shadow`: never blocks. Default.
- `guardian`: blocks hard rules and very high risk.
- `balanced`: uses risk, loop, progress, completion policy.

## Configuration

```json
{
  "mode": "shadow",
  "provider": "typesafe",
  "thresholds": { "riskAsk": 0.8, "riskDeny": 0.95, "stagnation": 0.88, "replan": 0.9, "completionContinue": 0.85 },
  "telemetry": { "persist": true }
}
```

Run `athena config`, `athena status`, and `athena events` for local inspection.
Run `athena report` for measured local session telemetry. `athena probe <semantic-loop|real-progress|safe-action|ambiguous-action|premature-completion>` makes one live Jev reflex request and requires `TYPESAFE_API_KEY`.

## Privacy

ATHENA writes redacted JSONL events under `.athena/events.jsonl`. It has no analytics or tracking. When TypeSafe provider runs, compact redacted goal, action, result, and rolling history state are sent to TypeSafe. API keys, bearer tokens, passwords, and common secret assignments are redacted before persistence and semantic calls. Set `telemetry.persist` to `false` to disable local event persistence. Never treat Jev judgment as safety guarantee. Read [security model](docs/architecture.md#security-model).

## Development

Node 20+ and pnpm required.

```bash
pnpm install
pnpm check
pnpm release:check
pnpm launch:check
pnpm --filter athena-jev build
node packages/cli/dist/index.js demo
```

## Benchmarks

Evaluation foundation lives in `evals/`. No benchmark claims are published until measured experimentally. Read [benchmarks](docs/benchmarks.md).

Run `pnpm eval` to validate reproducible fixture definitions. It does not produce benchmark claims.
Run `pnpm eval:report` to render only measured JSON stored in `evals/results/`.

## Roadmap

Supported adapters: OpenCode V1, OpenCode V2, Codex CLI, and Cursor. Claude Code is planned.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md).

Repository topics: `jev`, `typesafe`, `coding-agents`, `opencode`, `ai-agents`, `developer-tools`, `agentic-ai`, `typescript`, `system-one`.

⭐ If you want coding agents to know when they're doing something stupid, consider starring ATHENA.

## License

MIT. See [LICENSE](LICENSE).
