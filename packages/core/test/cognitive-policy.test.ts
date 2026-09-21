import { describe, expect, it } from "vitest";
import { CognitivePolicy, DEFAULT_COGNITIVE_POLICY_CONFIG, assertCognitivePolicyConfig, buildCognitiveWorldState, initialCognitiveState, policyResultToDecisionEvent, policyResultToEvidenceEvent, transitionCognitiveState, type CognitiveAssessment, type CognitiveState } from "../src/cognition/index.js";

const assessment = (overrides: Partial<CognitiveAssessment> = {}): CognitiveAssessment => ({ safety: { failureProbability: 0.1, impactSeverity: 0.1, irreversibility: 0.1, policyViolationProbability: 0 } as CognitiveAssessment["safety"], progress: { progressProbability: 0.8, informationGainProbability: 0.8, strategyNovelty: 0.8, stagnationProbability: 0.1, goalAlignment: 0.9 } as CognitiveAssessment["progress"], completion: { goalSatisfiedProbability: 0.2, evidenceCoverage: 0.8, unresolvedObligationsProbability: 0.1 } as CognitiveAssessment["completion"], epistemics: { stateUncertainty: 0.1, contextSufficiency: 0.9, contradictionProbability: 0.1 } as CognitiveAssessment["epistemics"], ...overrides });
const world = () => buildCognitiveWorldState({ goal: { goalId: "g", description: "fix defect" }, candidate: { id: "c", kind: "tool", intent: "inspect defect", tool: "read" }, recentActions: [], recentStrategies: [], unresolvedObligations: [], environment: { workingMode: "offline", availableCapabilities: ["read"], relevantConstraints: [] } });
const state = (overrides: Partial<CognitiveState> = {}): CognitiveState => ({ ...initialCognitiveState(), ...overrides });
const policy = new CognitivePolicy();

describe("CognitivePolicy", () => {
  it("validates explicit immutable configuration", () => {
    expect(Object.isFrozen(DEFAULT_COGNITIVE_POLICY_CONFIG)).toBe(true);
    expect(() => assertCognitivePolicyConfig({ ...DEFAULT_COGNITIVE_POLICY_CONFIG, safety: { ...DEFAULT_COGNITIVE_POLICY_CONFIG.safety, failure: NaN } })).toThrow();
    expect(() => assertCognitivePolicyConfig({ ...DEFAULT_COGNITIVE_POLICY_CONFIG, temporal: { ...DEFAULT_COGNITIVE_POLICY_CONFIG.temporal, persistenceFrames: 1.5 } })).toThrow();
    expect(() => assertCognitivePolicyConfig({ ...DEFAULT_COGNITIVE_POLICY_CONFIG, cooldown: { actionsAfterDeliberation: 0 } })).toThrow();
    expect(() => assertCognitivePolicyConfig({ ...DEFAULT_COGNITIVE_POLICY_CONFIG, safety: { failure: 0.8 } })).toThrow();
  });

  it("allows healthy direct progress and useful investigation", () => {
    expect(policy.evaluate(assessment(), state(), world()).decision).toBe("GO");
    const investigation = assessment({ progress: { progressProbability: 0.1, informationGainProbability: 0.95, strategyNovelty: 0.8, stagnationProbability: 0.1, goalAlignment: 0.9 } as CognitiveAssessment["progress"] });
    expect(policy.evaluate(investigation, state(), world()).reasons).toEqual(["SAFE_INFORMATION_GATHERING"]);
  });

  it("requires persistent multi-signal stagnation", () => {
    const stalled = assessment({ progress: { progressProbability: 0.1, informationGainProbability: 0.1, strategyNovelty: 0.1, stagnationProbability: 0.8, goalAlignment: 0.9 } as CognitiveAssessment["progress"] });
    expect(policy.evaluate(stalled, state(), world()).decision).toBe("GO");
    expect(policy.evaluate(stalled, state({ consecutiveHighStagnation: 2, consecutiveLowInformationGain: 2, consecutiveLowProgress: 2 }), world()).decision).toBe("DELIBERATE");
  });

  it("applies hard safety and irreversible-risk precedence", () => {
    expect(policy.evaluate(assessment(), state(), world(), { allowed: false, reasonCode: "FS_ROOT" }).decision).toBe("BLOCK");
    const danger = assessment({ safety: { failureProbability: 0.9, impactSeverity: 0.9, irreversibility: 0.9, policyViolationProbability: 0 } as CognitiveAssessment["safety"], progress: { ...assessment().progress, informationGainProbability: 0.99 } as CognitiveAssessment["progress"] });
    expect(policy.evaluate(danger, state(), world()).decision).toBe("BLOCK");
  });

  it("prioritizes verification over deliberation and avoids verification loops", () => {
    const incomplete = assessment({ completion: { goalSatisfiedProbability: 0.9, evidenceCoverage: 0.2, unresolvedObligationsProbability: 0.6 } as CognitiveAssessment["completion"], progress: { progressProbability: 0.1, informationGainProbability: 0.1, strategyNovelty: 0.1, stagnationProbability: 0.99, goalAlignment: 0.9 } as CognitiveAssessment["progress"] });
    expect(policy.evaluate(incomplete, state({ consecutiveHighStagnation: 3 }), world()).decision).toBe("VERIFY");
    expect(policy.evaluate(incomplete, state({ phase: "AWAITING_VERIFICATION", activeCandidateId: "c", pendingVerificationCandidateId: "c", hasCompletedAssessment: true }), world()).decision).not.toBe("VERIFY");
  });

  it("handles contradiction, insufficient context, goal drift, and cooldown", () => {
    const contradictory = assessment({ epistemics: { stateUncertainty: 0.1, contextSufficiency: 0.9, contradictionProbability: 0.9 } as CognitiveAssessment["epistemics"] });
    expect(policy.evaluate(contradictory, state(), world()).decision).toBe("DELIBERATE");
    const unknown = assessment({ epistemics: { stateUncertainty: 0.9, contextSufficiency: 0.1, contradictionProbability: 0.9 } as CognitiveAssessment["epistemics"] });
    expect(policy.evaluate(unknown, state(), world()).reasons).toEqual(["INSUFFICIENT_CONTEXT"]);
    const sideQuest = assessment({ progress: { progressProbability: 0.5, informationGainProbability: 0.1, strategyNovelty: 0.5, stagnationProbability: 0.1, goalAlignment: 0.1 } as CognitiveAssessment["progress"] });
    expect(policy.evaluate(sideQuest, state({ consecutiveLowInformationGain: 2 }), world()).decision).toBe("DELIBERATE");
    expect(policy.evaluate(contradictory, state({ deliberationsUsed: 1, actionsSinceLastDeliberation: 0 }), world()).reasons).toEqual(["DELIBERATION_COOLDOWN"]);
  });

  it("is pure, emits causal events, and reducer accepts them", () => {
    const input = assessment(); const before = state(); const first = policy.evaluate(input, before, world());
    expect(policy.evaluate(input, before, world())).toEqual(first);
    expect(before).toEqual(initialCognitiveState());
    let current = transitionCognitiveState(initialCognitiveState(), { type: "CANDIDATE_PROPOSED", candidateId: "c", kind: "tool", intent: "inspect", timestamp: "t", sessionId: "s" });
    current = transitionCognitiveState(current, { type: "ASSESSMENT_STARTED", candidateId: "c", timestamp: "t", sessionId: "s" });
    current = transitionCognitiveState(current, { type: "ASSESSMENT_COMPLETED", candidateId: "c", assessment: input, timestamp: "t", sessionId: "s" });
    current = transitionCognitiveState(current, policyResultToEvidenceEvent(first, "c", "t", "s"));
    current = transitionCognitiveState(current, policyResultToDecisionEvent(first, input, "c", "t", "s"));
    expect(current.lastDecision).toBe("GO");
    expect(current.consecutiveLowProgress).toBe(first.temporalEvidence.consecutiveLowProgress);
  });

  it("always returns one complete deterministic decision", () => {
    let seed = 7;
    const next = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
    for (let index = 0; index < 100; index++) {
      const input = assessment({ safety: { failureProbability: next(), impactSeverity: next(), irreversibility: next(), policyViolationProbability: next() } as CognitiveAssessment["safety"], progress: { progressProbability: next(), informationGainProbability: next(), strategyNovelty: next(), stagnationProbability: next(), goalAlignment: next() } as CognitiveAssessment["progress"], completion: { goalSatisfiedProbability: next(), evidenceCoverage: next(), unresolvedObligationsProbability: next() } as CognitiveAssessment["completion"], epistemics: { stateUncertainty: next(), contextSufficiency: next(), contradictionProbability: next() } as CognitiveAssessment["epistemics"] });
      const output = policy.evaluate(input, state(), world());
      expect(["GO", "DELIBERATE", "VERIFY", "BLOCK"]).toContain(output.decision);
      expect(output.policyVersion).toBe("0.3.0");
      expect(output.reasons.length).toBeGreaterThan(0);
    }
  });
});
