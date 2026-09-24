import { describe, expect, it } from "vitest";
import { CognitivePolicy, buildCognitiveWorldState, initialCognitiveState } from "@athena/core";
import { TypeSafeSystem1Error, createTypeSafeSystem1 } from "../src/index.js";

const world = () => buildCognitiveWorldState({ goal: { goalId: "g", description: "inspect authentication expiry" }, candidate: { id: "c", kind: "tool", tool: "read", intent: "inspect expiration calculation" }, currentObservation: { source: "test", summary: "expiry test fails", outcome: "FAILURE" }, recentActions: [{ candidateId: "old", kind: "tool", intent: "rerun test", outcome: "FAILURE" }], recentStrategies: [{ strategyId: "rerun", intent: "fix expiry", approach: "rerun failing test" }], unresolvedObligations: [{ id: "tests", description: "run tests", status: "OPEN" }], environment: { workingMode: "offline", availableCapabilities: ["read"], relevantConstraints: ["no network"] } });

const scoreKeys = new Set(["impactSeverity", "irreversibility", "strategyNovelty", "goalAlignment", "evidenceCoverage", "stateUncertainty"]);
function client(extra = false, malformed = false) { let calls = 0; let received: Record<string, unknown> | undefined; return { get calls() { return calls; }, get received() { return received; }, systemOne: async ({ questions }: { questions: Record<string, unknown> }) => { calls++; received = questions; return { answers: Object.fromEntries([...Object.keys(questions), ...(extra ? ["shouldDeliberate"] : [])].map((key) => [key, malformed && key === "impactSeverity" ? { score: 4 } : scoreKeys.has(key) ? { score: 2 } : { noul: 0.2 }])) }; } }; }

describe("TypeSafe System-1 runtime", () => {
  it("uses one mixed System-1 request with fifteen atomic answers", async () => {
    const mock = client();
    const runtime = createTypeSafeSystem1(100, mock as never);
    const snapshot = await runtime.assess(world());
    expect(mock.calls).toBe(1);
    expect(Object.keys(mock.received ?? {}).sort()).toEqual(["contextSufficiency", "contradictionProbability", "evidenceCoverage", "failureProbability", "goalAlignment", "goalSatisfiedProbability", "impactSeverity", "informationGainProbability", "irreversibility", "policyViolationProbability", "progressProbability", "stagnationProbability", "stateUncertainty", "strategyNovelty", "unresolvedObligationsProbability"]);
    expect(Object.values(mock.received ?? {}).filter((question) => (question as { type?: string }).type === "noul")).toHaveLength(9);
    expect(Object.values(mock.received ?? {}).filter((question) => (question as { type?: string }).type === "score")).toHaveLength(6);
    expect(Object.values(mock.received ?? {}).filter((question) => (question as { type?: string }).type === "score").every((question) => (question as { criteria?: unknown[] }).criteria?.length === 4)).toBe(true);
    expect((mock.received?.impactSeverity as { criteria: string[] }).criteria.map((level) => level.split(":")[0])).toEqual(["NEGLIGIBLE", "RECOVERABLE", "SERIOUS", "CATASTROPHIC"]);
    expect((mock.received?.strategyNovelty as { criteria: string[] }).criteria.map((level) => level.split(":")[0])).toEqual(["SAME_STRATEGY", "SURFACE_VARIATION", "MATERIAL_CHANGE", "NEW_APPROACH"]);
    expect(snapshot.assessment.safety).toEqual({ failureProbability: 0.2, impactSeverity: 2 / 3, irreversibility: 2 / 3, policyViolationProbability: 0.2 });
    expect(snapshot.assessment.progress).toMatchObject({ strategyNovelty: 2 / 3, goalAlignment: 2 / 3 });
    expect(snapshot.assessment.completion.evidenceCoverage).toBe(2 / 3);
    expect(snapshot.assessment.epistemics.stateUncertainty).toBe(2 / 3);
    expect(snapshot.observerVersions).toEqual({ aegis: "1", metis: "1", nike: "1", epistemic: "1" });
    expect(runtime.latestTelemetry).toMatchObject({ requestCount: 1, questionCount: 15 });
    expect(new CognitivePolicy().evaluate(snapshot.assessment, initialCognitiveState(), snapshot.worldState).decision).toBeDefined();
  });

  it("keeps standalone AEGIS intensities as scores and separates evidence uncertainty from execution risk", async () => {
    const mock = client();
    const runtime = createTypeSafeSystem1(100, mock as never);
    const assessment = await runtime.judges.aegis.judge({ goal: world().goal, candidate: world().candidate, currentObservation: world().currentObservation, environment: world().environment, recentFailures: [] });
    expect(Object.values(mock.received ?? {}).filter((question) => (question as { type?: string }).type === "noul")).toHaveLength(2);
    expect(Object.values(mock.received ?? {}).filter((question) => (question as { type?: string }).type === "score")).toHaveLength(2);
    expect((mock.received?.failureProbability as { instructions: string }).instructions).toContain("destructiveness");
    expect((mock.received?.policyViolationProbability as { instructions: string }).instructions).toContain("specific stated goal or environment constraint");
    expect(assessment).toEqual({ failureProbability: 0.2, impactSeverity: 2 / 3, irreversibility: 2 / 3, policyViolationProbability: 0.2 });
  });

  it("regresses historical AEGIS evidence and hard-fact conflations at the question boundary", async () => {
    const mock = client();
    const runtime = createTypeSafeSystem1(100, mock as never);
    await runtime.assess(world());
    const failure = (mock.received?.failureProbability as { instructions: string }).instructions;
    const policy = (mock.received?.policyViolationProbability as { instructions: string }).instructions;
    expect(failure).toContain("completion answer"); // premature completion and weak-evidence claims
    expect(failure).toContain("untrusted/inferred/proposed evidence"); // provenance and proposed-vs-observed
    expect(failure).toContain("destructiveness"); // deterministic destructive facts are not semantic failure
    expect(policy).toContain("explicitly makes the action disallowed"); // policy requires an actual stated constraint
    expect(policy).toContain("failed prior action"); // repeated failure is not automatically a policy violation
  });

  it("rejects unexpected provider answer fields", async () => {
    const runtime = createTypeSafeSystem1(100, client(true) as never);
    await expect(runtime.assess(world())).rejects.toMatchObject({ name: "TypeSafeSystem1Error", kind: "INVALID_RESPONSE" } satisfies Partial<TypeSafeSystem1Error>);
  });

  it("rejects malformed mixed answers", async () => {
    const runtime = createTypeSafeSystem1(100, client(false, true) as never);
    await expect(runtime.assess(world())).rejects.toMatchObject({ name: "TypeSafeSystem1Error", kind: "INVALID_RESPONSE" } satisfies Partial<TypeSafeSystem1Error>);
  });

  it("surfaces typed provider failures without a fake fallback", async () => {
    const broken = { systemOne: async () => { throw new Error("network unavailable"); } };
    const runtime = createTypeSafeSystem1(100, broken as never);
    await expect(runtime.judges.aegis.judge({ goal: world().goal, candidate: world().candidate, currentObservation: world().currentObservation, environment: world().environment, recentFailures: [] })).rejects.toMatchObject({ name: "TypeSafeSystem1Error", kind: "TRANSPORT" } satisfies Partial<TypeSafeSystem1Error>);
    await expect(runtime.assess(world())).rejects.toMatchObject({ name: "TypeSafeSystem1Error", kind: "TRANSPORT" } satisfies Partial<TypeSafeSystem1Error>);
  });

  it("classifies timeout failures without creating probabilities", async () => {
    const timedOut = { systemOne: async () => { throw new Error("request timeout"); } };
    const runtime = createTypeSafeSystem1(100, timedOut as never);
    await expect(runtime.judges.metis.judge({ goal: world().goal, candidate: world().candidate, currentObservation: null, recentActions: [], recentStrategies: [] })).rejects.toMatchObject({ name: "TypeSafeSystem1Error", kind: "TIMEOUT" } satisfies Partial<TypeSafeSystem1Error>);
  });
});
