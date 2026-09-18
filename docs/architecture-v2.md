# ATHENA V2 Architecture

## Server Control Plane + TUI Observability Plane

```
                 OPENCODE V2

        ┌───────────────────────┐
        │    Coding Agent       │
        └──────────┬────────────┘
                   │
             tool activity
                   │
                   ▼
        ┌───────────────────────┐
        │   ATHENA SERVER       │
        │                       │
        │ Rules                 │
        │ Jev                   │
        │ Policy                │
        │ Replan Store          │
        └───────┬───────┬───────┘
                │       │
         system control │ RPC/events
                │       │
                ▼       ▼
        next reasoning  ATHENA TUI
                       ├─ footer
                       ├─ panel
                       ├─ toasts
                       └─ commands
```

## Control Flow

```
Agent thinks
    ↓
Agent proposes / performs action
    ↓
ATHENA observes
    ↓
Jev judges
    ↓
ATHENA policy decides
    ↓
REPLAN if required
    ↓
privileged SYSTEM context
    ↓
next primary model reasoning
    ↓
agent chooses next strategy
```

Public invariant:

> LLM thinks.
> Jev judges.
> ATHENA controls.
> Tools execute.

## Replan Lifecycle

```
detected → queued → injected → observing → resolved
                                         ↓
                              changed / ignored / unclear
```

### States

| State | Meaning |
|-------|---------|
| `detected` | METIS identified semantic stagnation |
| `queued` | PendingReplan created, awaiting next context hook |
| `injected` | Control instruction appended to system context |
| `observing` | Waiting for post-replan action evidence |
| `resolved` | Outcome determined |

### Outcomes

| Outcome | Meaning |
|---------|---------|
| `changed` | Agent adopted materially different strategy |
| `ignored` | Agent continued same approach despite injection |
| `unclear` | Insufficient evidence to classify |

## RPC Contract

Server plugin registers typed RPC with `id: "athena"`:

### Methods

| Method | Input | Output |
|--------|-------|--------|
| `status` | `{}` | `{ mode, provider, providerHealthy, jevCalls, jevFailures, medianLatency, budgetUsed, budgetLimit }` |
| `session` | `{ sessionID }` | `{ sessionID, pendingReplan, lastReplan, reflexCount, jevCallCount, budget }` |
| `setMode` | `{ mode }` | `{ mode }` |
| `recentEvents` | `{ sessionID?, limit? }` | `{ events[] }` |

### Events

| Event | Data |
|-------|------|
| `reflex` | `{ sessionID, reflex, decision, scores, latencyMs }` |
| `replanQueued` | `{ replanId, sessionID, stagnationScore }` |
| `replanInjected` | `{ replanId, sessionID }` |
| `replanOutcome` | `{ replanId, sessionID, strategyChanged }` |
| `modeChanged` | `{ mode }` |

## TUI Components

### Footer Status

```
ATHENA · BALANCED · JEV ✓ S 282ms
```

States:
- `ATHENA · {mode} · JEV ✓/!/OFF`
- `REPLAN` badge when pending

### Session Panel (`/athena`)

```
ATHENA
Give coding agents reflexes.

MODE
Balanced

PROVIDER
Jev           Healthy
Median        282 ms
Calls         14 / 100

RECENT REFLEXES

04:21  METIS   REPLAN
04:20  METIS   OBSERVE
04:20  AEGIS   ALLOW
```

### Slash Commands

| Command | Action |
|---------|--------|
| `/athena` | Open control panel |
| `/athena-mode shadow\|guardian\|balanced` | Change mode |

### Toasts

| Event | Toast |
|-------|-------|
| REPLAN queued | `ATHENA / METIS — Semantic stagnation detected` |
| Mode changed | `ATHENA — Mode changed: BALANCED` |

## Telemetry Events

| Event | Description |
|-------|-------------|
| `REFLEX_COMPLETED` | Jev evaluation finished |
| `REPLAN_DETECTED` | METIS identified loop |
| `REPLAN_QUEUED` | PendingReplan created |
| `REPLAN_CONTEXT_APPLIED` | Control instruction injected into system context |
| `POST_REPLAN_ACTION` | Tool executed after injection |
| `REPLAN_OUTCOME` | Strategy change classified |
| `MODE_CHANGED` | User changed ATHENA mode |
| `PROVIDER_STATUS` | Provider health update |

## Package Exports

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./tui": "./dist/tui.jsx"
  }
}
```

- `.` — Server plugin (`AthenaPlugin`, `OpenCodeBridge`, `athenaRpc`)
- `./tui` — TUI plugin (Solid.js JSX, loaded by OpenCode TUI runtime)

## Safety Invariants

1. ATHENA is never represented as user
2. Control instructions are machine policy, not conversation
3. One-shot consumption prevents re-injection
4. Session isolation prevents cross-session contamination
5. Stale replans expire after 30 minutes
6. TUI failure never breaks server hooks
7. Budget limits prevent excessive Jev calls
