# Architecture

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

```text
Coding agent
     |
actions and results
     v
ATHENA
     |
AEGIS / METIS / NIKE
     |
Jev semantic judgment
     |
ATHENA policy
     |
ALLOW / DENY / REPLAN
     |
agent continues
```

Core owns deterministic rules, policy, session state, replan lifecycle, redacted event storage, and normalization helpers. `@athena/typesafe` implements Jev providers. `@athena/agent-sdk` owns cross-runtime contracts. Adapters translate only their host runtime.

Jev never controls tools directly. It returns typed semantic judgment. ATHENA policy decides control.

## State And Replan

ATHENA observes only exposed data: goals, tool calls, results, errors, changed files, validation status, and bounded recent history. It does not inspect hidden reasoning.

Replan lifecycle: `detected`, `queued`, `injected`, `observing`, `resolved`. The next meaningful action is compared by semantic strategy family, not command-string inequality. Outcome is `changed`, `ignored`, or `unclear`.

## Stable v0.1 Behavior

METIS thresholds and policy behavior are frozen for comparative benchmark work. Calibration artifacts are constructed evidence, not large statistical benchmarks. See [METIS calibration](metis-calibration.md).

## Security

Read [security model](security-model.md). Core receives untrusted inputs, redacts before persistence/provider calls, and keeps deterministic catastrophic rules independent from Jev availability.
