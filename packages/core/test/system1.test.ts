import { describe, expect, it } from "vitest";
import {
  AegisObserver,
  CognitiveAssessmentEngine,
  CognitiveObserverError,
  EpistemicObserver,
  InvalidObserverAssessmentError,
  MAX_COGNITIVE_OBLIGATIONS,
  MAX_COGNITIVE_COLLECTION_ENTRIES,
  MAX_RECENT_COGNITIVE_ACTIONS,
  MAX_RECENT_STRATEGIES,
  MetisObserver,
  NikeObserver,
  buildCognitiveWorldState,
  assertCognitiveAssessment,
  assertSystem1Snapshot,
  createSystem1Snapshot,
  type AegisJudgmentInput,
  type EpistemicJudgmentInput,
  type MetisJudgmentInput,
  type NikeJudgmentInput,
  type ProbabilisticJudge,
  type SafetyAssessment,
  type ProgressAssessment,
  type CompletionAssessment,
  type EpistemicAssessment,
} from "../src/cognition/index.js";

const safety = { failureProbability: 0.1, impactSeverity: 0.2, irreversibility: 0.1, policyViolationProbability: 0 } as unknown as SafetyAssessment;
const progress = { progressProbability: 0.8, informationGainProbability: 0.9, strategyNovelty: 0.6, stagnationProbability: 0.1, goalAlignment: 0.95 } as unknown as ProgressAssessment;
const completion = { goalSatisfiedProbability: 0.3, evidenceCoverage: 0.4, unresolvedObligationsProbability: 0.6 } as unknown as CompletionAssessment;
const epistemics = { stateUncertainty: 0.2, contextSufficiency: 0.8, contradictionProbability: 0.1 } as unknown as EpistemicAssessment;

class FakeAegisObserver extends AegisObserver { constructor(value = safety) { super({ judge: async () => value } satisfies ProbabilisticJudge<AegisJudgmentInput, typeof safety>); } }
class FakeMetisObserver extends MetisObserver { constructor(value = progress) { super({ judge: async () => value } satisfies ProbabilisticJudge<MetisJudgmentInput, typeof progress>); } }
class FakeNikeObserver extends NikeObserver { constructor(value = completion) { super({ judge: async () => value } satisfies ProbabilisticJudge<NikeJudgmentInput, typeof completion>); } }
class FakeEpistemicObserver extends EpistemicObserver { constructor(value = epistemics) { super({ judge: async () => value } satisfies ProbabilisticJudge<EpistemicJudgmentInput, typeof epistemics>); } }

function world(overrides: Record<string, unknown> = {}) {
  return buildCognitiveWorldState({
    goal: { goalId: "phase-6c", description: "Implement System-1 perception", acceptanceCriteria: ["offline tests pass"], constraints: ["no provider access"] },
    candidate: { id: "candidate-1", kind: "tool", tool: "test", input: "pnpm test", intent: "verify implementation" },
    currentObservation: { source: "test", summary: "Existing tests pass", outcome: "SUCCESS" },
    recentActions: [{ candidateId: "candidate-0", kind: "tool", intent: "inspect source", tool: "read", outcome: "SUCCESS", informationSummary: "contracts found" }],
    recentStrategies: [{ strategyId: "inspect-contracts", intent: "understand contracts", approach: "read cognition source", target: "cognition" }],
    unresolvedObligations: [{ id: "run-tests", description: "Run tests", status: "OPEN" }],
    environment: { workingMode: "offline", availableCapabilities: ["read", "test"], relevantConstraints: ["no network"] },
    ...overrides,
  });
}

function engine() { return new CognitiveAssessmentEngine({ aegis: new FakeAegisObserver(), metis: new FakeMetisObserver(), nike: new FakeNikeObserver(), epistemic: new FakeEpistemicObserver() }); }

describe("CognitiveWorldState", () => {
  it("constructs deterministic, JSON-safe bounded state", () => {
    const input = { ...world(), recentActions: Array.from({ length: 20 }, (_, index) => ({ candidateId: `a-${index}`, kind: "tool" as const, intent: "inspect", outcome: "SUCCESS" as const })), recentStrategies: Array.from({ length: 10 }, (_, index) => ({ strategyId: `s-${index}`, intent: "inspect", approach: "read" })), unresolvedObligations: Array.from({ length: 20 }, (_, index) => ({ id: `o-${index}`, description: "verify", status: "OPEN" as const })) };
    const built = buildCognitiveWorldState(input);
    expect(buildCognitiveWorldState(JSON.parse(JSON.stringify(built)))).toEqual(built);
    expect(built.recentActions).toHaveLength(MAX_RECENT_COGNITIVE_ACTIONS);
    expect(built.recentStrategies).toHaveLength(MAX_RECENT_STRATEGIES);
    expect(built.unresolvedObligations).toHaveLength(MAX_COGNITIVE_OBLIGATIONS);
    expect(built.recentActions[0]?.candidateId).toBe("a-8");
    expect(built.recentStrategies[0]?.strategyId).toBe("s-4");
    expect(built.unresolvedObligations[0]?.id).toBe("o-8");
    expect(Object.keys(built)).not.toContain("chainOfThought");
    expect(buildCognitiveWorldState({ ...world(), environment: { availableCapabilities: Array.from({ length: 20 }, () => "test") } }).environment.availableCapabilities).toHaveLength(MAX_COGNITIVE_COLLECTION_ENTRIES);
  });

  it("rejects malformed compact inputs", () => {
    expect(() => buildCognitiveWorldState({ ...world(), goal: { goalId: "", description: "x" } } as unknown as Parameters<typeof buildCognitiveWorldState>[0])).toThrow();
    expect(() => buildCognitiveWorldState({ ...world(), candidate: { id: "", kind: "tool", intent: "x" } })).toThrow();
    expect(() => buildCognitiveWorldState({ ...world(), currentObservation: { source: "x", summary: "y", outcome: "bad" } } as unknown as Parameters<typeof buildCognitiveWorldState>[0])).toThrow();
    expect(() => buildCognitiveWorldState({ ...world(), unresolvedObligations: [{ id: "", description: "x", status: "OPEN" }] })).toThrow();
    expect(() => buildCognitiveWorldState({ ...world(), goal: { goalId: "g", description: "d", acceptanceCriteria: null } } as unknown as Parameters<typeof buildCognitiveWorldState>[0])).toThrow();
    expect(() => buildCognitiveWorldState({ ...world(), recentActions: null } as unknown as Parameters<typeof buildCognitiveWorldState>[0])).toThrow();
    expect(() => buildCognitiveWorldState({ ...world(), candidate: { id: "c", kind: "tool", intent: "i", chainOfThought: "hidden" } } as unknown as Parameters<typeof buildCognitiveWorldState>[0])).toThrow();
    expect(() => buildCognitiveWorldState({ ...world(), currentObservation: { source: "x".repeat(1001), summary: "y", outcome: "SUCCESS" } } as unknown as Parameters<typeof buildCognitiveWorldState>[0])).toThrow();
  });

  it("owns caller data", () => {
    const input = { goal: { goalId: "g", description: "original", acceptanceCriteria: ["test"], constraints: [] }, candidate: { id: "c", kind: "tool" as const, intent: "test" }, recentActions: [], recentStrategies: [], unresolvedObligations: [], environment: { availableCapabilities: ["test"] } };
    const built = buildCognitiveWorldState(input);
    input.goal.description = "mutated";
    input.goal.acceptanceCriteria[0] = "mutated";
    input.environment.availableCapabilities[0] = "mutated";
    expect(built.goal.description).toBe("original");
    expect(built.goal.acceptanceCriteria).toEqual(["test"]);
    expect(built.environment.availableCapabilities).toEqual(["test"]);
  });

  it("owns every nested collection and rejects runtime objects", () => {
    const input = { goal: { goalId: "g", description: "d", acceptanceCriteria: ["a"], constraints: ["c"] }, candidate: { id: "c", kind: "tool" as const, intent: "i" }, currentObservation: { source: "s", summary: "o", outcome: "SUCCESS" as const }, recentActions: [{ candidateId: "a", kind: "tool" as const, intent: "i", outcome: "SUCCESS" as const }], recentStrategies: [{ strategyId: "s", intent: "i", approach: "a" }], unresolvedObligations: [{ id: "o", description: "d", status: "OPEN" as "OPEN" | "SATISFIED" | "UNKNOWN" }], environment: { workingMode: "offline", availableCapabilities: ["read"], relevantConstraints: ["safe"] } };
    const built = buildCognitiveWorldState(input);
    input.goal.constraints[0] = "mutated";
    input.recentActions[0]!.intent = "mutated";
    input.recentStrategies[0]!.approach = "mutated";
    input.unresolvedObligations[0]!.status = "SATISFIED";
    input.environment.relevantConstraints[0] = "mutated";
    expect(built.goal.constraints).toEqual(["c"]);
    expect(built.recentActions[0]?.intent).toBe("i");
    expect(built.recentStrategies[0]?.approach).toBe("a");
    expect(built.unresolvedObligations[0]?.status).toBe("OPEN");
    expect(built.environment.relevantConstraints).toEqual(["safe"]);
    expect(() => buildCognitiveWorldState(new Date() as unknown as Parameters<typeof buildCognitiveWorldState>[0])).toThrow();
  });

  it("validates every nested contract and every bounded text field", () => {
    const invalid = (override: Record<string, unknown>) => expect(() => buildCognitiveWorldState({ ...world(), ...override } as Parameters<typeof buildCognitiveWorldState>[0])).toThrow();
    invalid({ currentObservation: { source: "s", summary: "x".repeat(1001), outcome: "SUCCESS" } });
    invalid({ recentActions: [{ candidateId: "a", kind: "other", intent: "i", outcome: "SUCCESS" }] });
    invalid({ recentActions: [{ candidateId: "a", kind: "tool", intent: "i", outcome: "SUCCESS", informationSummary: "x".repeat(1001) }] });
    invalid({ recentStrategies: [{ strategyId: "", intent: "i", approach: "a" }] });
    invalid({ recentStrategies: [{ strategyId: "s", intent: "i", approach: "x".repeat(1001) }] });
    invalid({ unresolvedObligations: [{ id: "o", description: "x".repeat(1001), status: "OPEN" }] });
    invalid({ unresolvedObligations: [{ id: "o", description: "d", status: "INVALID" }] });
    invalid({ environment: { workingMode: 1, availableCapabilities: ["read"], relevantConstraints: ["safe"] } });
    invalid({ environment: { availableCapabilities: ["x".repeat(1001)] } });
  });
});

describe("System-1 observers", () => {
  it("returns exact validated observer domains", async () => {
    const state = world();
    await expect(new FakeAegisObserver().assess(state)).resolves.toEqual(safety);
    await expect(new FakeMetisObserver().assess(state)).resolves.toEqual(progress);
    await expect(new FakeNikeObserver().assess(state)).resolves.toEqual(completion);
    await expect(new FakeEpistemicObserver().assess(state)).resolves.toEqual(epistemics);
    await expect(new FakeAegisObserver({ ...safety, failureProbability: NaN } as unknown as SafetyAssessment).assess(state)).rejects.toBeInstanceOf(InvalidObserverAssessmentError);
  });

  it("rejects hidden policy fields and malformed domain shapes", async () => {
    const state = world();
    await expect(new FakeAegisObserver({ ...safety, shouldBlock: true } as unknown as SafetyAssessment).assess(state)).rejects.toBeInstanceOf(InvalidObserverAssessmentError);
    await expect(new FakeMetisObserver({ ...progress, deliberationNeed: 1 } as unknown as ProgressAssessment).assess(state)).rejects.toBeInstanceOf(InvalidObserverAssessmentError);
    await expect(new FakeNikeObserver({ ...completion, shouldContinue: true } as unknown as CompletionAssessment).assess(state)).rejects.toBeInstanceOf(InvalidObserverAssessmentError);
    await expect(new FakeEpistemicObserver({ ...epistemics, shouldVerify: true } as unknown as EpistemicAssessment).assess(state)).rejects.toBeInstanceOf(InvalidObserverAssessmentError);
    expect(() => assertCognitiveAssessment({ safety, progress: { ...progress, stagnationProbability: Infinity }, completion, epistemics })).toThrow();
  });

  it("keeps perception dimensions independent across required scenarios", async () => {
    const state = world();
    const scenarios: ProgressAssessment[] = [
      { ...progress, progressProbability: 0.95, goalAlignment: 0.95, stagnationProbability: 0.05 } as unknown as ProgressAssessment,
      { ...progress, progressProbability: 0.35, informationGainProbability: 0.95, stagnationProbability: 0.08 } as unknown as ProgressAssessment,
      { ...progress, progressProbability: 0.1, informationGainProbability: 0.05, strategyNovelty: 0.05, stagnationProbability: 0.95 } as unknown as ProgressAssessment,
      { ...progress, progressProbability: 0.75, goalAlignment: 0.1 } as unknown as ProgressAssessment,
    ];
    for (const value of scenarios) expect(await new FakeMetisObserver(value).assess(state)).toEqual(value);
    expect(await new FakeNikeObserver({ goalSatisfiedProbability: 0.85, evidenceCoverage: 0.3, unresolvedObligationsProbability: 0.55 } as unknown as CompletionAssessment).assess(state)).toEqual({ goalSatisfiedProbability: 0.85, evidenceCoverage: 0.3, unresolvedObligationsProbability: 0.55 });
    expect(await new FakeEpistemicObserver({ stateUncertainty: 0.9, contextSufficiency: 0.15, contradictionProbability: 0.85 } as unknown as EpistemicAssessment).assess(state)).toEqual({ stateUncertainty: 0.9, contextSufficiency: 0.15, contradictionProbability: 0.85 });
    expect(await new FakeMetisObserver({ ...progress, progressProbability: 0.9, stagnationProbability: 0.9 } as unknown as ProgressAssessment).assess(state)).toMatchObject({ progressProbability: 0.9, stagnationProbability: 0.9 });
    expect(await new FakeEpistemicObserver({ stateUncertainty: 0.9, contextSufficiency: 0.9, contradictionProbability: 0.1 } as unknown as EpistemicAssessment).assess(state)).toMatchObject({ stateUncertainty: 0.9, contextSufficiency: 0.9 });
  });

  it("preserves strategy and obligation representation without policy", async () => {
    const state = world({ recentStrategies: [{ strategyId: "jwt", intent: "find expiry defect", approach: "inspect expiry calculation", hypothesisId: "expiry" }, { strategyId: "jwt", intent: "find expiry defect", approach: "inspect expiry calculation", hypothesisId: "expiry" }, { strategyId: "tests", intent: "prove behavior", approach: "run targeted test" }], unresolvedObligations: [{ id: "open", description: "run test", status: "OPEN" }, { id: "satisfied", description: "read code", status: "SATISFIED" }, { id: "unknown", description: "confirm deployment", status: "UNKNOWN" }] });
    expect(state.recentStrategies[0]).toMatchObject(state.recentStrategies[1]!);
    expect(state.recentStrategies[2]?.strategyId).toBe("tests");
    const seen: NikeJudgmentInput[] = [];
    await new NikeObserver({ judge: async (input) => { seen.push(input); return completion; } }).assess(state);
    expect(seen[0]?.obligations.map((item) => item.status)).toEqual(["OPEN", "SATISFIED", "UNKNOWN"]);
  });
});

describe("CognitiveAssessmentEngine", () => {
  it("starts all observers concurrently, combines exact domains, and owns output", async () => {
    const started: string[] = [];
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const delayed = <Input, Output>(name: string, value: Output): ProbabilisticJudge<Input, Output> => ({ judge: async () => { started.push(name); await gate; return value; } });
    const safetyValue = { failureProbability: 0.1, impactSeverity: 0.2, irreversibility: 0.1, policyViolationProbability: 0 };
    const assessmentEngine = new CognitiveAssessmentEngine({ aegis: new AegisObserver(delayed("aegis", safetyValue as unknown as SafetyAssessment)), metis: new MetisObserver(delayed("metis", progress)), nike: new NikeObserver(delayed("nike", completion)), epistemic: new EpistemicObserver(delayed("epistemic", epistemics)) });
    const pending = assessmentEngine.assess(world());
    await Promise.resolve();
    expect(started).toEqual(expect.arrayContaining(["aegis", "metis", "nike", "epistemic"]));
    release?.();
    const assessment = await pending;
    safetyValue.failureProbability = 0.99;
    expect(assessment.safety.failureProbability).toBe(0.1);
    expect(Object.keys(assessment)).toEqual(["safety", "progress", "completion", "epistemics"]);
  });

  it("fails whole assessment on observer failure and serializes owned snapshots", async () => {
    const broken = new AegisObserver({ judge: async () => { throw new Error("offline"); } });
    const brokenEngine = new CognitiveAssessmentEngine({ aegis: broken, metis: new FakeMetisObserver(), nike: new FakeNikeObserver(), epistemic: new FakeEpistemicObserver() });
    await expect(brokenEngine.assess(world())).rejects.toBeInstanceOf(CognitiveObserverError);
    const snapshot = await engine().snapshot(world());
    expect(JSON.parse(JSON.stringify(snapshot)).assessmentSchemaVersion).toBe("1");
    expect(Object.isFrozen(snapshot.assessment.safety)).toBe(true);
    expect(Object.isFrozen(snapshot.worldState.goal)).toBe(true);
  });

  it("canonicalizes one immutable world for every observer", async () => {
    const seen: unknown[] = [];
    const capture = <Input, Output>(value: Output): ProbabilisticJudge<Input, Output> => ({ judge: async (input) => { seen.push(input); return value; } });
    const assessmentEngine = new CognitiveAssessmentEngine({ aegis: new AegisObserver(capture(safety)), metis: new MetisObserver(capture(progress)), nike: new NikeObserver(capture(completion)), epistemic: new EpistemicObserver(capture(epistemics)) });
    const mutable = { ...world(), goal: { ...world().goal, description: "before" } };
    const assessment = await assessmentEngine.assess(mutable);
    mutable.goal.description = "after";
    expect(assessment.progress).toEqual(progress);
    expect(seen).toHaveLength(4);
    expect(Object.isFrozen((seen[0] as AegisJudgmentInput).candidate)).toBe(true);
    expect(Object.isFrozen((seen[1] as MetisJudgmentInput).goal)).toBe(true);
    expect((seen[0] as AegisJudgmentInput).candidate).toBe((seen[1] as MetisJudgmentInput).candidate);
  });

  it("builds pure offline snapshots with validated round trips", async () => {
    const snapshot = await engine().snapshot(world());
    const parsed = JSON.parse(JSON.stringify(snapshot));
    expect(assertSystem1Snapshot(parsed)).toEqual(snapshot);
    expect(Object.keys(snapshot).sort()).toEqual(["assessment", "assessmentSchemaVersion", "observerVersions", "worldState"]);
    expect(Object.keys(snapshot.observerVersions).sort()).toEqual(["aegis", "epistemic", "metis", "nike"]);
    expect(() => assertSystem1Snapshot({ ...parsed, decision: "forbidden" })).toThrow();
    expect(() => assertSystem1Snapshot({ ...parsed, observerVersions: { ...parsed.observerVersions, aegis: "" } })).toThrow();
  });

  it("owns world and assessment data supplied to snapshot construction", () => {
    const input = { goal: { goalId: "g", description: "original", acceptanceCriteria: [], constraints: [] }, candidate: { id: "c", kind: "answer" as const, intent: "respond" }, recentActions: [], recentStrategies: [], unresolvedObligations: [], environment: { availableCapabilities: [] } };
    const assessment = { safety: { ...safety }, progress: { ...progress }, completion: { ...completion }, epistemics: { ...epistemics } };
    const snapshot = createSystem1Snapshot(buildCognitiveWorldState(input), assessment, { aegis: "1", metis: "1", nike: "1", epistemic: "1" });
    input.goal.description = "mutated";
    (assessment.safety as { failureProbability: number }).failureProbability = 0.99;
    expect(snapshot.worldState.goal.description).toBe("original");
    expect(snapshot.assessment.safety.failureProbability).toBe(0.1);
  });

  it("keeps snapshot world aligned with assessment across asynchronous observation", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const delayed = <Input, Output>(value: Output): ProbabilisticJudge<Input, Output> => ({ judge: async () => { await gate; return value; } });
    const assessmentEngine = new CognitiveAssessmentEngine({ aegis: new AegisObserver(delayed(safety)), metis: new MetisObserver(delayed(progress)), nike: new NikeObserver(delayed(completion)), epistemic: new EpistemicObserver(delayed(epistemics)) });
    const source = { ...world(), goal: { ...world().goal, description: "before" } };
    const pending = assessmentEngine.snapshot(source);
    source.goal.description = "after";
    release?.();
    expect((await pending).worldState.goal.description).toBe("before");
  });
});
