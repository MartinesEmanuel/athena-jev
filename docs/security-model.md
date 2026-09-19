# Security Model

ATHENA processes untrusted agent and tool data. It is a control layer, not a safety guarantee.

```text
Hard deterministic rules
          |
          v
Semantic Jev evaluation
          |
          v
ATHENA policy
```

Jev judges. ATHENA decides.

## Trust Boundaries

Tool inputs, shell output, MCP output, repository files, agent context, and prompts can contain hostile instructions. ATHENA does not treat them as policy instructions. It bounds and normalizes observed state before semantic evaluation and persistence.

## Deterministic Rules

Known catastrophic filesystem deletion, destructive Git actions, destructive database actions, environment-file access, and unjustified privilege escalation are handled in deterministic code. These rules do not depend on Jev availability.

## Jev And Policy

Jev returns typed probabilistic semantic judgments. It does not execute tools and is not ground truth. ATHENA policy maps hard rules and judgments to allow, ask, deny, or replan according to configured mode.

Provider failures fail open for semantic judgments and emit redacted `REFLEX_FAILED` telemetry. Deterministic catastrophic rules remain authoritative. Adapters use their native deny mechanism only when supported.

## Privacy And Redaction

ATHENA redacts common API keys, bearer tokens, passwords, and secret assignments before persistence and TypeSafe calls. Telemetry is local JSONL by default. Set `telemetry.persist` to `false` to disable persistence. Redaction reduces exposure; do not place secrets in tool commands or repository files.

## Replan Context

ATHENA never represents itself as a user. Replan uses supported system, developer, tool-control, or privileged context only. If a runtime lacks such a channel, adapter capability must say so.

## Operational Limits

State is bounded: recent actions, result summaries, error entries, and changed files are capped. ANSI escapes are stripped. Timeouts or network loss must not turn ordinary work into a semantic provider outage. Validate sensitive operations independently.
