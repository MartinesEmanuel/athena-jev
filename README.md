# ATHENA

**Give coding agents reflexes.**

ATHENA is an independent open-source cognitive control layer for coding agents, powered by TypeSafe Jev. It adds native OpenCode observability while keeping the agent in control by default.

> LLM thinks → Jev judges → ATHENA observes → tools execute.

## Install

```sh
npm install -g athena-jev
athena install
opencode
```

`athena install` registers ATHENA globally for supported OpenCode versions. On first use, run `athena setup` to store and validate a TypeSafe/Jev credential in ATHENA-owned configuration. For offline development, use `athena install --demo`.

## What it does

- **Cognitive Control:** AEGIS (safety), METIS (progress), NIKE (evidence), and EPISTEMICS (uncertainty) compute `GO`, `DELIBERATE`, `VERIFY`, and `BLOCK`.
- **Passive by default:** `enforcementMode: observe` records decisions such as **WOULD BLOCK** without interrupting OpenCode. Switch to `enforce` only when desired.
- **Tool Router:** predicts the smallest useful capability set. It defaults to `observe`, so all host tools remain visible.
- **Native OpenCode V2 TUI:** a compact white-and-blue sidebar; V1 remains supported with reduced UI capability.

```text
Coding host → ATHENA adapter → Tool Router → LLM → Cognitive Runtime
                                                    ↓
                         AEGIS · METIS · NIKE · EPISTEMICS → decisions → tools
```

## CLI

```text
athena install [--demo]     Install the global OpenCode integration
athena setup                Securely configure TypeSafe/Jev
athena status               Show safe runtime status
athena doctor [--verbose]   Diagnose installation issues
athena config set cognition.enforcement enforce
athena config set toolRouter.mode active
athena repair               Recreate ATHENA-owned integration files
athena uninstall [--purge] Remove integration; optionally config and credentials
athena update               Show the safe npm update command
```

## Privacy and security

Credentials are stored by ATHENA at `$XDG_CONFIG_HOME/athena` (or `~/.config/athena`) with restrictive permissions. They are not put in OpenCode configuration, project files, shell exports, or telemetry. ATHENA sends compact redacted state to Jev and does not persist chain-of-thought, raw tool arguments, raw outputs, or credentials.

See [Security](SECURITY.md), [contributing](CONTRIBUTING.md), [Tool Router](docs/tool-router.md), and [architecture](docs/architecture.md).

## Development

```sh
corepack enable
pnpm install
pnpm check
```

Node.js 20+ is required. Live TypeSafe tests are opt-in; regular CI is offline.

## License

[MIT](LICENSE)
