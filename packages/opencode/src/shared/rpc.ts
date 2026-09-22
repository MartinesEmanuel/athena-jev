export const athenaRpc = {
  id: "athena",
  methods: {
    status: {
      input: { type: "object" as const, properties: {}, required: [] },
      output: {
        type: "object" as const,
        properties: {
          mode: { type: "string" },
          provider: { type: "string" },
          providerHealthy: { type: "boolean" },
          jevCalls: { type: "number" },
          jevFailures: { type: "number" },
          medianLatency: { type: "number" },
          budgetUsed: { type: "number" },
          budgetLimit: { type: "number" },
        },
        required: ["mode", "provider", "providerHealthy", "jevCalls", "jevFailures", "medianLatency", "budgetUsed", "budgetLimit"],
      },
    },
    session: {
      input: {
        type: "object" as const,
        properties: { sessionID: { type: "string" } },
        required: ["sessionID"],
      },
      output: {
        type: "object" as const,
        properties: {
          sessionID: { type: "string" },
          lastRisk: { type: ["object", "null"] },
          lastStagnation: { type: ["object", "null"] },
          lastCompletion: { type: ["object", "null"] },
          pendingReplan: { type: ["object", "null"] },
          lastReplan: { type: ["object", "null"] },
          reflexCount: { type: "number" },
          jevCallCount: { type: "number" },
          budgetUsed: { type: "number" },
          budgetLimit: { type: "number" },
        },
        required: ["sessionID", "reflexCount", "jevCallCount", "budgetUsed", "budgetLimit"],
      },
    },
    setMode: {
      input: {
        type: "object" as const,
        properties: { mode: { type: "string", enum: ["shadow", "guardian", "balanced"] } },
        required: ["mode"],
      },
      output: {
        type: "object" as const,
        properties: { mode: { type: "string" } },
        required: ["mode"],
      },
    },
    snapshot: {
      input: {
        type: "object" as const,
        properties: { sessionID: { type: "string" } },
        required: ["sessionID"],
      },
      output: {
        type: "object" as const,
        properties: { snapshot: { type: ["object", "null"] } },
        required: ["snapshot"],
      },
    },
    recentEvents: {
      input: {
        type: "object" as const,
        properties: { sessionID: { type: "string" }, limit: { type: "number" } },
        required: [],
      },
      output: {
        type: "object" as const,
        properties: {
          events: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string" },
                timestamp: { type: "string" },
                metadata: { type: "object" },
              },
              required: ["type", "timestamp"],
            },
          },
        },
        required: ["events"],
      },
    },
  },
  events: {
    reflex: {
      schema: {
        type: "object" as const,
        properties: {
          sessionID: { type: "string" },
          reflex: { type: "string" },
          decision: { type: "string" },
          scores: { type: "object" },
          latencyMs: { type: "number" },
        },
        required: ["sessionID", "reflex", "decision"],
      },
    },
    replanQueued: {
      schema: {
        type: "object" as const,
        properties: {
          replanId: { type: "string" },
          sessionID: { type: "string" },
          stagnationScore: { type: "number" },
        },
        required: ["replanId", "sessionID", "stagnationScore"],
      },
    },
    replanInjected: {
      schema: {
        type: "object" as const,
        properties: {
          replanId: { type: "string" },
          sessionID: { type: "string" },
        },
        required: ["replanId", "sessionID"],
      },
    },
    replanOutcome: {
      schema: {
        type: "object" as const,
        properties: {
          replanId: { type: "string" },
          sessionID: { type: "string" },
          strategyChanged: { type: "string" },
        },
        required: ["replanId", "sessionID", "strategyChanged"],
      },
    },
    modeChanged: {
      schema: {
        type: "object" as const,
        properties: {
          mode: { type: "string" },
        },
        required: ["mode"],
      },
    },
    snapshot: {
      schema: {
        type: "object" as const,
        properties: {
          snapshot: { type: "object" },
        },
        required: ["snapshot"],
      },
    },
    /** Server-side `/athena`: ask the TUI to open the expanded panel. */
    panelRequested: {
      schema: {
        type: "object" as const,
        properties: {
          sessionID: { type: "string" },
        },
        required: ["sessionID"],
      },
    },
    /** Server-side `/athena-mode`: inline notice for the expanded panel. */
    commandNotice: {
      schema: {
        type: "object" as const,
        properties: {
          message: { type: "string" },
        },
        required: ["message"],
      },
    },
  },
} as const;
