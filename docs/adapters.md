# Agent adapters

ATHENA is a reflex runtime for coding agents. `@athena/agent-sdk` owns version-independent action, result, capability, and control contracts. Adapters normalize native hooks and encode controls without exposing host schemas to core policy.

| Adapter | Status | Control context |
| --- | --- | --- |
| OpenCode V1 | supported | system context |
| OpenCode V2 | supported | system context |
| Codex CLI | implemented and offline tested | `PostToolUse.additionalContext` developer/tool context |
| Cursor | next phase | not implemented |
| Claude Code | future roadmap | not implemented |

Codex `PreToolUse` maps to AEGIS. Codex `PostToolUse` maps to METIS. A REPLAN emits only Codex hook `additionalContext`; ATHENA never sends a synthetic user message. Per-session state persists beneath `.athena/codex/`. Run `athena init codex` to merge project `.codex/hooks.json` handlers without replacing existing hooks.
