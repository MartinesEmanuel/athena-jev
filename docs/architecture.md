# Architecture

ATHENA runs deterministic rules first, then optional TypeSafe Jev semantic judgments, then explicit policy. Core owns domain state and has no TypeSafe or OpenCode dependency. Providers receive compact redacted state. JSONL event store remains local.

```text
             ┌────────────────┐
             │ Coding Agent   │
             │ GPT / Claude   │
             └───────┬────────┘
                     │ proposed action
                     ▼
             ┌────────────────┐
             │ ATHENA         │
             │ Rules          │
             │   ↓ Jev Reflex │
             │   ↓ Policy     │
             └───────┬────────┘
                     │ ALLOW / ASK / DENY / REPLAN
                     ▼
                   TOOLS
                     │ result
                     └──────→ session state
```

ATHENA does not inspect hidden chain-of-thought. It consumes observable goal, tool calls, results, errors, changed files, build/test status, and session history.

## OpenCode

`@athena/opencode` uses documented OpenCode V2 `tool.execute.before`, `tool.execute.after`, and `experimental.session.compacting` hooks. Before hook can throw to deny or require approval. After hook records progress and evaluates stagnation. Current API does not expose reliable direct completion-attempt interception; completion reflex is available to adapter callers and no unsupported hook is claimed. Replan signal survives compaction through documented compaction context hook.

## Security model

Tool input can be hostile. Tool output can contain prompt injection. Repository files can be malicious. Agents can make poor decisions. Jev output is typed probability, not authority. Do not feed unbounded raw output to semantic state. Hard rules cover clear catastrophic filesystem, Git, database, environment-file, and unjustified escalation patterns. No safety guarantee exists.

## Failure behavior

Semantic provider failures fail open and produce redacted `REFLEX_FAILED` telemetry. TypeSafe network loss never makes normal OpenCode work unavailable. Deterministic catastrophic protections remain independent of Jev. In shadow mode ATHENA never changes agent behavior; it records prediction, policy, mode, provider, scores, and later tool outcome. Set `provider: "demo"` only for offline development and demos.

## State limits and injection resistance

ATHENA uses code-defined questions and JSON-structured state. It never treats tool output as instruction. It strips ANSI sequences, normalizes whitespace, redacts secrets, and bounds state: eight recent actions, 1,500-character result summaries, ten error entries, and twenty changed files. No second LLM summarizes state.
