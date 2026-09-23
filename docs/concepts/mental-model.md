# 60-second mental model

Without ATHENA, a host sends a prompt and tools to a model, then executes a proposed tool call. With ATHENA, the host can first route visible capabilities, then ATHENA evaluates each proposed action against a compact WorldState.

```mermaid
flowchart TD
U[User] --> H[Host / OpenCode]
H --> R[Tool Router]
R --> L[LLM]
L --> A[ATHENA cognitive runtime]
A --> J[Jev typed judgments]
J --> P[Deterministic policy]
P --> T[Host tool execution]
T --> A
```

LLM thinks. Jev judges. ATHENA controls or observes. Tools execute. In default observe mode, policy is visible but non-authoritative.
