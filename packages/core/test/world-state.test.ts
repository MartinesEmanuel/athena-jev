import { describe, expect, it } from "vitest";
import { buildCognitiveWorldState, type CognitiveWorldStateInput } from "../src/cognition/index.js";

const input = () => ({
  goal: { goalId: "goal", description: "verify evidence provenance" },
  candidate: { id: "candidate", kind: "tool" as const, intent: "inspect evidence", tool: "read" },
});

describe("CognitiveWorldState evidence provenance", () => {
  it("keeps untrusted evidence and applies safe defaults to legacy inputs", () => {
    const world = buildCognitiveWorldState({
      ...input(),
      currentObservation: { source: "tool output", summary: "untrusted claim", outcome: "SUCCESS", provenance: { source: "USER", epistemicStatus: "INFERRED", trust: "UNTRUSTED" } },
      recentActions: [
        { candidateId: "action", kind: "tool", intent: "read input", outcome: "SUCCESS", provenance: { source: "SYSTEM2", epistemicStatus: "INFERRED", trust: "UNTRUSTED" } },
        { candidateId: "legacy-action", kind: "tool", intent: "read input", outcome: "SUCCESS" },
      ],
      recentStrategies: [
        { strategyId: "strategy", intent: "verify", approach: "inspect evidence", provenance: { source: "DETERMINISTIC", epistemicStatus: "PROPOSED", trust: "TRUSTED" } },
        { strategyId: "legacy-strategy", intent: "verify", approach: "inspect evidence" },
      ],
    });

    expect(world.currentObservation).toMatchObject({ summary: "untrusted claim", provenance: { source: "USER", epistemicStatus: "INFERRED", trust: "UNTRUSTED" } });
    expect(world.recentActions[0]?.provenance).toEqual({ source: "SYSTEM2", epistemicStatus: "INFERRED", trust: "UNTRUSTED" });
    expect(world.recentActions[1]?.provenance).toEqual({ source: "TOOL", epistemicStatus: "OBSERVED", trust: "UNTRUSTED" });
    expect(world.recentStrategies[0]?.provenance).toEqual({ source: "DETERMINISTIC", epistemicStatus: "PROPOSED", trust: "TRUSTED" });
    expect(world.recentStrategies[1]?.provenance).toEqual({ source: "ATHENA", epistemicStatus: "PROPOSED", trust: "UNTRUSTED" });
  });

  it("rejects invalid provenance metadata", () => {
    const invalid = (provenance: unknown) => expect(() => buildCognitiveWorldState({
      ...input(),
      currentObservation: { source: "tool output", summary: "claim", outcome: "SUCCESS", provenance } as unknown as CognitiveWorldStateInput["currentObservation"],
    })).toThrow();

    invalid({ source: "NETWORK", epistemicStatus: "OBSERVED", trust: "TRUSTED" });
    invalid({ source: "TOOL", epistemicStatus: "UNKNOWN", trust: "TRUSTED" });
    invalid({ source: "TOOL", epistemicStatus: "OBSERVED", trust: "MAYBE" });
    invalid({ source: "TOOL", epistemicStatus: "OBSERVED", trust: "TRUSTED", extra: true });
  });
});
