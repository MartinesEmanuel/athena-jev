import { describe, expect, it } from "vitest";
import { CognitivePolicy, InvalidSystem2ResultError, StaleDeliberationResultError, System2DeliberationError, System2DeliberationOrchestrator, assertRevisedStrategy, assertSystem2DeliberationResult, assessStrategyShift, buildCognitiveWorldState, buildDeliberationRequest, initialCognitiveState, policyResultToDecisionEvent, policyResultToEvidenceEvent, renderDeliberationContext, transitionCognitiveState, type CognitiveAssessment, type CognitivePolicyResult, type System2Bridge } from "../src/cognition/index.js";

const stalled = (): CognitiveAssessment => ({ safety: { failureProbability: 0.1, impactSeverity: 0.1, irreversibility: 0.1, policyViolationProbability: 0 } as CognitiveAssessment["safety"], progress: { progressProbability: 0.1, informationGainProbability: 0.1, strategyNovelty: 0.1, stagnationProbability: 0.8, goalAlignment: 0.9 } as CognitiveAssessment["progress"], completion: { goalSatisfiedProbability: 0.1, evidenceCoverage: 0.9, unresolvedObligationsProbability: 0.1 } as CognitiveAssessment["completion"], epistemics: { stateUncertainty: 0.1, contextSufficiency: 0.9, contradictionProbability: 0.1 } as CognitiveAssessment["epistemics"] });
const world = () => buildCognitiveWorldState({ goal: { goalId: "g", description: "fix expiry", constraints: ["keep API stable"] }, candidate: { id: "c", kind: "tool", tool: "read", intent: "inspect failing test" }, recentActions: [{ candidateId: "old", kind: "tool", intent: "rerun test", outcome: "FAILURE" }], recentStrategies: [{ strategyId: "rerun", intent: "fix expiry", approach: "rerun failing test", hypothesisId: "test-flake" }], unresolvedObligations: [{ id: "tests", description: "run tests", status: "OPEN" }], environment: { workingMode: "offline", availableCapabilities: ["read"], relevantConstraints: ["no network"] } });
function active(policy: CognitivePolicyResult, assessment: CognitiveAssessment) { let state = transitionCognitiveState(initialCognitiveState(), { type: "CANDIDATE_PROPOSED", candidateId: "c", kind: "tool", intent: "inspect", timestamp: "t", sessionId: "s" }); state = transitionCognitiveState(state, { type: "ASSESSMENT_STARTED", candidateId: "c", timestamp: "t", sessionId: "s" }); state = transitionCognitiveState(state, { type: "ASSESSMENT_COMPLETED", candidateId: "c", assessment, timestamp: "t", sessionId: "s" }); state = transitionCognitiveState(state, policyResultToEvidenceEvent(policy, "c", "t", "s")); return transitionCognitiveState(state, policyResultToDecisionEvent(policy, assessment, "c", "t", "s")); }

class FakeSystem2Bridge implements System2Bridge {
  calls = 0;
  async deliberate(request: Parameters<System2Bridge["deliberate"]>[0]) { this.calls++; return { requestId: request.requestId, candidateId: request.candidateId, revisedStrategy: { strategyId: "expiry-calculation", intent: "inspect expiration calculation", approach: "read token expiration calculation", hypothesisId: "expiry", supersedesStrategyId: request.currentStrategy.strategyId, changeSummary: "Inspect expiration calculation instead of rerunning tests." } }; }
}

describe("System-2 deliberation orchestration", () => {
  it("validates compact structured responses and rejects private fields", () => {
    expect(assertRevisedStrategy({ strategyId: "s", intent: "i", approach: "a" })).toMatchObject({ strategyId: "s" });
    expect(() => assertRevisedStrategy({ strategyId: "s", intent: "i", approach: "a", chainOfThought: "hidden" })).toThrow();
    expect(() => assertSystem2DeliberationResult({ requestId: "r", candidateId: "c", revisedStrategy: { strategyId: "s", intent: "i", approach: "a" }, reasoningTrace: "hidden" })).toThrow();
  });

  it("renders deterministic bounded privileged context without user impersonation", () => {
    const policy = new CognitivePolicy().evaluate(stalled(), { ...initialCognitiveState(), consecutiveHighStagnation: 2, consecutiveLowInformationGain: 2, consecutiveLowProgress: 2 }, world());
    const request = buildDeliberationRequest("r", policy, world(), stalled());
    const context = renderDeliberationContext(request);
    expect(renderDeliberationContext(request)).toEqual(context);
    expect(context.text).toContain("ATHENA COGNITIVE INTERVENTION");
    expect(context.text).not.toContain("User:");
    expect(context.text.length).toBeLessThan(4000);
  });

  it("runs full offline lifecycle through reducer", async () => {
    const assessment = stalled(); const policy = new CognitivePolicy().evaluate(assessment, { ...initialCognitiveState(), consecutiveHighStagnation: 2, consecutiveLowInformationGain: 2, consecutiveLowProgress: 2 }, world());
    let state = active(policy, assessment); expect(state.deliberationsUsed).toBe(1); const bridge = new FakeSystem2Bridge(); const orchestrator = new System2DeliberationOrchestrator(bridge);
    const output = await orchestrator.deliberate({ requestId: "r1", policy, world: world(), assessment, state, sessionId: "s", timestamp: "t", currentState: () => state });
    expect(bridge.calls).toBe(1); state = transitionCognitiveState(state, output.events[0]); state = transitionCognitiveState(state, output.events[1]);
    expect(state.phase).toBe("AWAITING_STRATEGY_SHIFT"); expect(output.strategyShift.strategyChanged).toBe(true);
    state = transitionCognitiveState(state, { type: "STRATEGY_SHIFT_OBSERVED", candidateId: "c", from: "rerun", to: output.revisedStrategy.strategyId, timestamp: "t", sessionId: "s" });
    expect(state.phase).toBe("READY");
  });

  it("rejects wrong, stale, and duplicate results without lifecycle mutation", async () => {
    const assessment = stalled(); const policy = new CognitivePolicy().evaluate(assessment, { ...initialCognitiveState(), consecutiveHighStagnation: 2, consecutiveLowInformationGain: 2, consecutiveLowProgress: 2 }, world()); const state = active(policy, assessment);
    const wrong: System2Bridge = { deliberate: async () => ({ requestId: "wrong", candidateId: "c", revisedStrategy: { strategyId: "s", intent: "i", approach: "a" } }) }; await expect(new System2DeliberationOrchestrator(wrong).deliberate({ requestId: "r", policy, world: world(), assessment, state, sessionId: "s", timestamp: "t", currentState: () => state })).rejects.toBeInstanceOf(InvalidSystem2ResultError);
    const wrongCandidate: System2Bridge = { deliberate: async () => ({ requestId: "r", candidateId: "other", revisedStrategy: { strategyId: "s", intent: "i", approach: "a" } }) }; await expect(new System2DeliberationOrchestrator(wrongCandidate).deliberate({ requestId: "r", policy, world: world(), assessment, state, sessionId: "s", timestamp: "t", currentState: () => state })).rejects.toBeInstanceOf(InvalidSystem2ResultError);
    const bridge = new FakeSystem2Bridge(); const orchestrator = new System2DeliberationOrchestrator(bridge); await expect(orchestrator.deliberate({ requestId: "r", policy, world: world(), assessment, state, sessionId: "s", timestamp: "t", currentState: () => ({ ...state, phase: "READY" }) })).rejects.toBeInstanceOf(StaleDeliberationResultError);
    const output = await orchestrator.deliberate({ requestId: "r2", policy, world: world(), assessment, state, sessionId: "s", timestamp: "t", currentState: () => state }); expect(output.request.requestId).toBe("r2"); await expect(orchestrator.deliberate({ requestId: "r2", policy, world: world(), assessment, state, sessionId: "s", timestamp: "t", currentState: () => state })).rejects.toBeInstanceOf(StaleDeliberationResultError);
  });

  it("does not invoke System 2 for non-deliberation decisions", async () => {
    const bridge = new FakeSystem2Bridge(); const orchestrator = new System2DeliberationOrchestrator(bridge); const assessment = stalled(); const base = new CognitivePolicy().evaluate(assessment, initialCognitiveState(), world());
    for (const decision of ["GO", "VERIFY", "BLOCK"] as const) await expect(orchestrator.deliberate({ requestId: decision, policy: { ...base, decision }, world: world(), assessment, state: initialCognitiveState(), sessionId: "s", timestamp: "t", currentState: initialCognitiveState })).rejects.toBeInstanceOf(System2DeliberationError);
    expect(bridge.calls).toBe(0);
  });

  it("records no meaningful shift without recursive intervention", () => {
    expect(assessStrategyShift({ strategyId: "s", intent: "i", approach: "a" }, { strategyId: "new", intent: "i", approach: "a" }).outcome).toBe("NO_MEANINGFUL_STRATEGY_SHIFT");
  });

  it("keeps lifecycle coherent when System 2 fails", async () => {
    const assessment = stalled(); const policy = new CognitivePolicy().evaluate(assessment, { ...initialCognitiveState(), consecutiveHighStagnation: 2, consecutiveLowInformationGain: 2, consecutiveLowProgress: 2 }, world()); const state = active(policy, assessment);
    const broken: System2Bridge = { deliberate: async () => { throw new Error("provider secret must not leak"); } };
    await expect(new System2DeliberationOrchestrator(broken).deliberate({ requestId: "r", policy, world: world(), assessment, state, sessionId: "s", timestamp: "t", currentState: () => state })).rejects.toBeInstanceOf(System2DeliberationError);
    expect(state.phase).toBe("AWAITING_SYSTEM2");
  });
});
