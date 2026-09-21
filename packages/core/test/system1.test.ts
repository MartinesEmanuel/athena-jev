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
    expect(Object.keys(built)).not.toContain("chainOfThought");
    expect(buildCognitiveWorldState({ ...world(), environment: { availableCapabilities: Array.from({ length: 20 }, () => "test") } }).environment.availableCapabilities).toHaveLength(MAX_COGNITIVE_COLLECTION_ENTRIES);
  });

  it("rejects malformed compact inputs", () => {
    expect(() => buildCognitiveWorldState({ ...world(), goal: { goalId: "", description: "x" } } as unknown as Parameters<typeof buildCognitiveWorldState>[0])).toThrow();
    expect(() => buildCognitiveWorldState({ ...world(), candidate: { id: "", kind: "tool", intent: "x" } })).toThrow();
    expect(() => buildCognitiveWorldState({ ...world(), currentObservation: { source: "x", summary: "y", outcome: "bad" } } as unknown as Parameters<typeof buildCognitiveWorldState>[0])).toThrow();
    expect(() => buildCognitiveWorldState({ ...world(), unresolvedObligations: [{ id: "", description: "x", status: "OPEN" }] })).toThrow();
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
});
