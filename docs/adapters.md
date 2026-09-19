# Adapters

`@athena/agent-sdk` defines version-independent capabilities, normalized actions/results, and canonical control signals. Adapters translate native hooks; ATHENA core never needs host hook schemas.

## Verified Support

| Runtime | Integration | Before action | After action | REPLAN transport | Session | Live validation |
| --- | --- | --- | --- | --- | --- | --- |
| OpenCode V1 `1.18.31` | plugin | `tool.execute.before` | `tool.execute.after` | `experimental.chat.system.transform` | OpenCode session ID | proven |
| OpenCode V2 plugin API `2.0.7` | plugin | `execute.before` | `execute.after` | context hook system context | OpenCode session ID | proven |
| OpenAI Codex CLI `0.154.0` | `hooks.json` | `PreToolUse` | `PostToolUse` | `additionalContext` in privileged developer/tool context | Codex session ID | proven |

AEGIS runs at before-action hooks. METIS runs after action results, including failures where native runtime exposes them. NIKE requires a completion observation hook; adapters do not claim interception where unavailable.

All adapters persist canonical telemetry, maintain per-session state, and never emit a synthetic user message for ATHENA control.

## Experimental

Cursor adapter is experimental and is not part of ATHENA v0.1 verified support. Its installed terminal Agent runtime did not dispatch native project hooks during live validation. It is not installed or documented as part of public CLI support.

Claude Code is planned.

## Adapter Requirements

New adapters must declare truthful capabilities, normalize action/result data, use canonical telemetry and replan lifecycle, run adapter compliance tests, redact secrets, isolate sessions, and never inject ATHENA as a user. Live proof is required when runtime provides automation.
