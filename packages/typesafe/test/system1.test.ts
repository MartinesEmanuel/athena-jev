import { describe, expect, it } from "vitest";
import { CognitiveObserverError, CognitivePolicy, buildCognitiveWorldState, initialCognitiveState } from "@athena/core";
import { TypeSafeSystem1Error, createTypeSafeSystem1 } from "../src/index.js";

const world = () => buildCognitiveWorldState({ goal: { goalId: "g", description: "inspect authentication expiry" }, candidate: { id: "c", kind: "tool", tool: "read", intent: "inspect expiration calculation" }, currentObservation: { source: "test", summary: "expiry test fails", outcome: "FAILURE" }, recentActions: [{ candidateId: "old", kind: "tool", intent: "rerun test", outcome: "FAILURE" }], recentStrategies: [{ strategyId: "rerun", intent: "fix expiry", approach: "rerun failing test" }], unresolvedObligations: [{ id: "tests", description: "run tests", status: "OPEN" }], environment: { workingMode: "offline", availableCapabilities: ["read"], relevantConstraints: ["no network"] } });

function client(extra = false) { return { systemOne: async ({ questions }: { questions: Record<string, unknown> }) => ({ answers: Object.fromEntries([...Object.keys(questions), ...(extra ? ["shouldDeliberate"] : [])].map((key) => [key, { noul: 0.2 }])) }) }; }

describe("TypeSafe System-1 runtime", () => {
  it("wires four live-shaped judges into the core snapshot engine", async () => {
    const runtime = createTypeSafeSystem1(100, client() as never);
    const snapshot = await runtime.assess(world());
    expect(snapshot.assessment.safety).toEqual({ failureProbability: 0.2, impactSeverity: 0.2, irreversibility: 0.2, policyViolationProbability: 0.2 });
    expect(snapshot.assessment.progress).toHaveProperty("strategyNovelty", 0.2);
    expect(snapshot.observerVersions).toEqual({ aegis: "1", metis: "1", nike: "1", epistemic: "1" });
    expect(new CognitivePolicy().evaluate(snapshot.assessment, initialCognitiveState(), snapshot.worldState).decision).toBeDefined();
  });

  it("rejects unexpected provider answer fields and fails whole assessment", async () => {
    const runtime = createTypeSafeSystem1(100, client(true) as never);
    await expect(runtime.assess(world())).rejects.toBeInstanceOf(CognitiveObserverError);
  });

  it("surfaces typed provider failures without a fake fallback", async () => {
    const broken = { systemOne: async () => { throw new Error("network unavailable"); } };
    const runtime = createTypeSafeSystem1(100, broken as never);
    await expect(runtime.judges.aegis.judge({ candidate: world().candidate, environment: world().environment, recentFailures: [] })).rejects.toMatchObject({ name: "TypeSafeSystem1Error", kind: "TRANSPORT" } satisfies Partial<TypeSafeSystem1Error>);
    await expect(runtime.assess(world())).rejects.toBeInstanceOf(CognitiveObserverError);
  });

  it("classifies timeout failures without creating probabilities", async () => {
    const timedOut = { systemOne: async () => { throw new Error("request timeout"); } };
    const runtime = createTypeSafeSystem1(100, timedOut as never);
    await expect(runtime.judges.metis.judge({ goal: world().goal, candidate: world().candidate, currentObservation: null, recentActions: [], recentStrategies: [] })).rejects.toMatchObject({ name: "TypeSafeSystem1Error", kind: "TIMEOUT" } satisfies Partial<TypeSafeSystem1Error>);
  });
});
