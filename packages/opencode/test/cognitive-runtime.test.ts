import { describe, expect, it } from "vitest";
import type { CognitiveAssessment, System1Snapshot } from "@athena/core";
import { CognitiveRuntime, type System1Runtime } from "../src/index.js";

function assessment(overrides: Record<string, unknown> = {}): CognitiveAssessment {
  return {
    safety: { failureProbability: 0.1, impactSeverity: 0.1, irreversibility: 0.1, policyViolationProbability: 0.1 },
    progress: { progressProbability: 0.8, informationGainProbability: 0.8, strategyNovelty: 0.8, stagnationProbability: 0.1, goalAlignment: 0.9 },
    completion: { goalSatisfiedProbability: 0.1, evidenceCoverage: 0.9, unresolvedObligationsProbability: 0.1 },
    epistemics: { stateUncertainty: 0.1, contextSufficiency: 0.9, contradictionProbability: 0.1 },
    ...overrides,
  } as CognitiveAssessment;
}

function fake(value: CognitiveAssessment): System1Runtime & { calls: number } {
  return {
    calls: 0,
    async assess(world): Promise<System1Snapshot> {
      this.calls++;
      return { worldState: world, assessment: value, assessmentSchemaVersion: "1", observerVersions: { aegis: "1", metis: "1", nike: "1", epistemic: "1" } };
    },
  };
}

describe("CognitiveRuntime", () => {
  it("captures bounded prompt goal, assesses each candidate once, and retains untrusted output evidence", async () => {
    const system1 = fake(assessment());
    const runtime = new CognitiveRuntime(system1);
    runtime.capturePrompt("session", "Inspect configuration");
    await runtime.before("session", "one", "read", { path: "package.json" });
    runtime.after("session", "one", "read", "completed", "token=secret-value observed output");
    await runtime.before("session", "two", "read", { path: "tsconfig.json" });
    expect(system1.calls).toBe(2);
    expect(runtime.summary("session")).toMatchObject({ goalCaptured: true, phase: "EXECUTING", lastDecision: "GO" });
  });

  it("blocks BLOCK decisions before tool execution", async () => {
    const system1 = fake(assessment({ safety: { failureProbability: 0.1, impactSeverity: 0.1, irreversibility: 0.1, policyViolationProbability: 0.99 } }));
    const runtime = new CognitiveRuntime(system1);
    await expect(runtime.before("session", "blocked", "bash", { command: "unsafe" })).rejects.toThrow("ATHENA blocked bash");
    expect(runtime.counters("session")).toMatchObject({ assessments: 1, blocked: 1 });
  });

  it("queues only privileged deliberation context and resolves lifecycle before next candidate", async () => {
    const stalled = assessment({ progress: { progressProbability: 0.1, informationGainProbability: 0.1, strategyNovelty: 0.1, stagnationProbability: 0.9, goalAlignment: 0.9 } });
    const system1 = fake(stalled);
    const runtime = new CognitiveRuntime(system1);
    for (const id of ["one", "two"]) {
      await runtime.before("session", id, "bash", { command: "repeat" });
      runtime.after("session", id, "bash", "completed", "no progress");
    }
    await expect(runtime.before("session", "three", "bash", { command: "repeat" })).rejects.toThrow("ATHENA deliberation required");
    const context = runtime.injectContext("session");
    expect(context).toContain("ATHENA COGNITIVE INTERVENTION");
    await runtime.before("session", "four", "read", { path: "new-evidence" });
    expect(system1.calls).toBe(4);
  });

  it("queues distinct verification context", async () => {
    const system1 = fake(assessment({ completion: { goalSatisfiedProbability: 0.9, evidenceCoverage: 0.1, unresolvedObligationsProbability: 0.9 } }));
    const runtime = new CognitiveRuntime(system1);
    await expect(runtime.before("session", "verify", "bash", { command: "finish" })).rejects.toThrow("ATHENA verification required");
    expect(runtime.injectContext("session")).toContain("ATHENA VERIFICATION REQUIRED");
    expect(runtime.summary("session").pendingContext).toBeNull();
  });
});
