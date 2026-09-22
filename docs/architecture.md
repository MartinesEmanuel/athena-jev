# Architecture

ATHENA uses System 1 and System 2 as an architectural metaphor, not a literal neuroscience claim. System 2 is host coding-agent deliberation. ATHENA System 1 evaluates candidate actions before execution.

```text
System 2 / host agent
        |
candidate tool action
        |
ATHENA cognitive runtime
        |
WorldState -> Jev primitive judgments -> CognitivePolicy
        |
GO / DELIBERATE / VERIFY / BLOCK
```

## WorldState and System 1

`CognitiveWorldState` contains bounded goal, candidate action, current observation, recent actions, recent strategies, unresolved obligations, and environment constraints. Tool input, output, repository content, and host context are untrusted evidence. ATHENA normalizes and redacts these inputs before persistence or provider calls.

TypeSafe Jev provides typed primitive judgments in four domains:

- **AEGIS**: failure risk, impact, irreversibility, policy violation.
- **METIS**: progress, information gain, novelty, stagnation, alignment.
- **NIKE**: goal satisfaction, evidence coverage, unresolved obligations.
- **EPISTEMICS**: uncertainty, context sufficiency, contradiction.

## Policy and state

`CognitivePolicy` combines deterministic rules with typed System-1 assessment. Deterministic code remains authoritative for known danger. Jev does not execute tools or make final control decisions.

`transitionCognitiveState` is a deterministic reducer for candidate, assessment, decision, tool result, verification, and deliberation events. It tracks temporal cognitive state without storing hidden model reasoning.

## Tool and deliberation lifecycles

Before a host executes a tool, ATHENA builds WorldState, requests System-1 assessment, and applies policy. `GO` permits execution. `BLOCK` rejects execution. `DELIBERATE` stops current action, queues host System-2 context, and evaluates subsequent action again. `VERIFY` requires evidence before work continues or completion is claimed.

After host reports a tool result, ATHENA records bounded redacted observation and updates state. Every later candidate re-enters System 1.

## HUD observability

`CognitiveRuntime` emits redacted `AthenaHudSnapshot` records to an optional local Unix socket. HUD receives push updates only. It receives no prompts, provider responses, or reasoning. HUD observer failures are isolated from cognition.

## Provider and host boundaries

`@athena/core` contains provider-independent contracts, policy, reducer, and redacted event store. `@athena/typesafe` owns Jev and standalone System-2 provider integrations. `@athena/agent-sdk` owns host-independent adapter contracts. Host packages translate native hooks only; they do not place host schemas in core.
