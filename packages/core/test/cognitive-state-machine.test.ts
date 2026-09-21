import { describe, expect, it } from "vitest";
import {
  assertCognitiveStateInvariant,
  CognitiveStateInvariantError,
  CognitiveTransitionError,
  initialCognitiveState,
  MAX_RECENT_COGNITIVE_ASSESSMENTS,
  replayCognitiveEvents,
  transitionCognitiveState,
} from "../src/cognition/index.js";
import type {
  CognitiveAssessment,
  CognitiveEvent,
  CognitiveGateResult,
  CognitiveState,
  Probability,
} from "../src/cognition/index.js";

const A = "candidate-A";
const B = "candidate-B";
const base = { timestamp: "2026-01-01T00:00:00Z", sessionId: "session-1" };
const p = (value: number) => value as Probability;

function assessment(progress = 0.8): CognitiveAssessment {
  return {
    safety: { failureProbability: p(0.1), impactSeverity: p(0.2), irreversibility: p(0), policyViolationProbability: p(0) },
    progress: { progressProbability: p(progress), informationGainProbability: p(0.7), strategyNovelty: p(0.5), stagnationProbability: p(0.1), goalAlignment: p(0.9) },
    completion: { goalSatisfiedProbability: p(0.3), evidenceCoverage: p(0.4), unresolvedObligationsProbability: p(0.6) },
    epistemics: { stateUncertainty: p(0.2), contextSufficiency: p(0.8), contradictionProbability: p(0) },
  };
}

function gateResult(decision: "GO" | "DELIBERATE" | "VERIFY" | "BLOCK"): CognitiveGateResult {
  return { decision, assessment: assessment(), reasons: ["HEALTHY_PROGRESS"], policyVersion: "0.2.0" };
}

function event<T extends CognitiveEvent>(value: Omit<T, "timestamp" | "sessionId">): T {
  return { ...base, ...value } as T;
}

const propose = (candidateId = A) => event<Extract<CognitiveEvent, { type: "CANDIDATE_PROPOSED" }>>({ type: "CANDIDATE_PROPOSED", candidateId, kind: "tool", intent: "test" });
const start = (candidateId = A) => event<Extract<CognitiveEvent, { type: "ASSESSMENT_STARTED" }>>({ type: "ASSESSMENT_STARTED", candidateId });
const complete = (candidateId = A, value = assessment()) => event<Extract<CognitiveEvent, { type: "ASSESSMENT_COMPLETED" }>>({ type: "ASSESSMENT_COMPLETED", candidateId, assessment: value });
const decide = (decision: "GO" | "DELIBERATE" | "VERIFY" | "BLOCK", candidateId = A) => event<Extract<CognitiveEvent, { type: "COGNITIVE_DECISION" }>>({ type: "COGNITIVE_DECISION", candidateId, gateResult: gateResult(decision) });
const allowed = (candidateId = A) => event<Extract<CognitiveEvent, { type: "ACTION_ALLOWED" }>>({ type: "ACTION_ALLOWED", candidateId });
const toolDone = (candidateId = A) => event<Extract<CognitiveEvent, { type: "TOOL_COMPLETED" }>>({ type: "TOOL_COMPLETED", candidateId });
const deliberationRequested = (candidateId = A) => event<Extract<CognitiveEvent, { type: "DELIBERATION_REQUESTED" }>>({ type: "DELIBERATION_REQUESTED", candidateId, reasons: [] });
const deliberationApplied = (candidateId = A) => event<Extract<CognitiveEvent, { type: "DELIBERATION_APPLIED" }>>({ type: "DELIBERATION_APPLIED", candidateId, outcome: "changed" });
const strategyShift = (candidateId = A) => event<Extract<CognitiveEvent, { type: "STRATEGY_SHIFT_OBSERVED" }>>({ type: "STRATEGY_SHIFT_OBSERVED", candidateId, from: "old", to: "new" });
const verificationRequested = (candidateId = A) => event<Extract<CognitiveEvent, { type: "VERIFICATION_REQUESTED" }>>({ type: "VERIFICATION_REQUESTED", candidateId });
const verificationCompleted = (candidateId = A) => event<Extract<CognitiveEvent, { type: "VERIFICATION_COMPLETED" }>>({ type: "VERIFICATION_COMPLETED", candidateId, passed: true });
const blocked = (candidateId = A) => event<Extract<CognitiveEvent, { type: "ACTION_BLOCKED" }>>({ type: "ACTION_BLOCKED", candidateId, reasons: ["HARD_RULE"] });
const degraded = (error = "runtime-unavailable") => event<Extract<CognitiveEvent, { type: "COGNITIVE_RUNTIME_DEGRADED" }>>({ type: "COGNITIVE_RUNTIME_DEGRADED", error });

const assessed = (candidateId = A) => [propose(candidateId), start(candidateId), complete(candidateId)];
const executing = () => replayCognitiveEvents([...assessed(), decide("GO")]);
const awaitingSystem2 = () => replayCognitiveEvents([...assessed(), decide("DELIBERATE")]);
const awaitingShift = () => replayCognitiveEvents([...assessed(), decide("DELIBERATE"), deliberationApplied()]);
const awaitingVerification = () => replayCognitiveEvents([...assessed(), decide("VERIFY")]);

describe("Phase 6B lifecycle", () => {
  it("executes GO only after assessment and authorization", () => {
    const final = replayCognitiveEvents([...assessed(), decide("GO"), allowed(), toolDone()]);
    expect(final).toMatchObject({ phase: "READY", step: 1, actionsSinceLastDeliberation: 1, activeCandidateId: null, executionAuthorized: false });
    assertCognitiveStateInvariant(final);
  });

  it("completes deliberation lifecycle", () => {
    const final = replayCognitiveEvents([...assessed(), decide("DELIBERATE"), deliberationRequested(), deliberationApplied(), strategyShift()]);
    expect(final).toMatchObject({ phase: "READY", deliberationsUsed: 1, pendingDeliberationCandidateId: null, awaitingStrategyShift: false });
  });

  it("completes verification lifecycle", () => {
    const final = replayCognitiveEvents([...assessed(), decide("VERIFY"), verificationRequested(), verificationCompleted()]);
    expect(final).toMatchObject({ phase: "READY", verificationsUsed: 1, pendingVerificationCandidateId: null });
  });

  it("BLOCK returns READY once without execution", () => {
    const final = replayCognitiveEvents([...assessed(), decide("BLOCK")]);
    expect(final).toMatchObject({ phase: "READY", blocks: 1, activeCandidateId: null, executionAuthorized: false });
  });
});

describe("Candidate and assessment causality", () => {
  it("rejects stale candidate events across assessment, execution, deliberation, strategy shift, and verification", () => {
    expect(() => transitionCognitiveState(replayCognitiveEvents([propose(A)]), start(B))).toThrow(CognitiveTransitionError);
    expect(() => transitionCognitiveState(replayCognitiveEvents([propose(A), start(A)]), complete(B))).toThrow(CognitiveTransitionError);
    expect(() => transitionCognitiveState(executing(), allowed(B))).toThrow(CognitiveTransitionError);
    expect(() => transitionCognitiveState(transitionCognitiveState(executing(), allowed(A)), toolDone(B))).toThrow(CognitiveTransitionError);
    expect(() => transitionCognitiveState(awaitingSystem2(), deliberationRequested(B))).toThrow(CognitiveTransitionError);
    expect(() => transitionCognitiveState(awaitingSystem2(), deliberationApplied(B))).toThrow(CognitiveTransitionError);
    expect(() => transitionCognitiveState(awaitingShift(), strategyShift(B))).toThrow(CognitiveTransitionError);
    expect(() => transitionCognitiveState(awaitingVerification(), verificationRequested(B))).toThrow(CognitiveTransitionError);
    expect(() => transitionCognitiveState(awaitingVerification(), verificationCompleted(B))).toThrow(CognitiveTransitionError);
  });

  it("never lets stale assessment populate active candidate state", () => {
    const state = replayCognitiveEvents([propose(A), start(A)]);
    const before = JSON.parse(JSON.stringify(state));
    expect(() => transitionCognitiveState(state, complete(B))).toThrow(CognitiveTransitionError);
    expect(state).toEqual(before);
  });

  it("rejects empty candidate IDs at runtime", () => {
    expect(() => transitionCognitiveState(initialCognitiveState(), propose(""))).toThrow(CognitiveTransitionError);
  });
});

describe("Decision and execution preconditions", () => {
  it("rejects every decision before completed assessment", () => {
    for (const decision of ["GO", "DELIBERATE", "VERIFY", "BLOCK"] as const) {
      expect(() => transitionCognitiveState(replayCognitiveEvents([propose()]), decide(decision))).toThrow(CognitiveTransitionError);
      expect(() => transitionCognitiveState(replayCognitiveEvents([propose(), start()]), decide(decision))).toThrow(CognitiveTransitionError);
    }
  });

  it("rejects completion without start and duplicate completion", () => {
    expect(() => transitionCognitiveState(replayCognitiveEvents([propose()]), complete())).toThrow(CognitiveTransitionError);
    const state = replayCognitiveEvents(assessed());
    expect(() => transitionCognitiveState(state, complete())).toThrow(CognitiveTransitionError);
  });

  it("rejects TOOL_COMPLETED before ACTION_ALLOWED", () => {
    expect(() => transitionCognitiveState(executing(), toolDone())).toThrow(CognitiveTransitionError);
  });

  it("rejects duplicate ACTION_ALLOWED and TOOL_COMPLETED", () => {
    const authorized = transitionCognitiveState(executing(), allowed());
    expect(() => transitionCognitiveState(authorized, allowed())).toThrow(CognitiveTransitionError);
    const ready = transitionCognitiveState(authorized, toolDone());
    expect(() => transitionCognitiveState(ready, toolDone())).toThrow(CognitiveTransitionError);
  });
});

describe("Duplicate event defense", () => {
  it("strictly rejects completed, decision, applied, strategy shift, completion, and degraded duplicates", () => {
    const assessedState = replayCognitiveEvents(assessed());
    expect(() => transitionCognitiveState(assessedState, complete())).toThrow(CognitiveTransitionError);
    const go = transitionCognitiveState(assessedState, decide("GO"));
    expect(() => transitionCognitiveState(go, decide("GO"))).toThrow(CognitiveTransitionError);
    const system2 = awaitingSystem2();
    const shifted = transitionCognitiveState(system2, deliberationApplied());
    expect(() => transitionCognitiveState(shifted, deliberationApplied())).toThrow(CognitiveTransitionError);
    const ready = transitionCognitiveState(shifted, strategyShift());
    expect(() => transitionCognitiveState(ready, strategyShift())).toThrow(CognitiveTransitionError);
    const verifying = awaitingVerification();
    const verified = transitionCognitiveState(verifying, verificationCompleted());
    expect(() => transitionCognitiveState(verified, verificationCompleted())).toThrow(CognitiveTransitionError);
    const down = transitionCognitiveState(initialCognitiveState(), degraded());
    expect(() => transitionCognitiveState(down, degraded())).toThrow(CognitiveTransitionError);
  });

  it("makes request events intentionally idempotent audit delivery", () => {
    const system2 = awaitingSystem2();
    expect(transitionCognitiveState(transitionCognitiveState(system2, deliberationRequested()), deliberationRequested())).toEqual(system2);
    const verifying = awaitingVerification();
    expect(transitionCognitiveState(transitionCognitiveState(verifying, verificationRequested()), verificationRequested())).toEqual(verifying);
  });
});

describe("Block audit semantics", () => {
  it("uses design A: BLOCK drives state; ACTION_BLOCKED is rejected by reducer", () => {
    const ready = replayCognitiveEvents([...assessed(), decide("BLOCK")]);
    expect(ready.blocks).toBe(1);
    expect(() => transitionCognitiveState(ready, blocked())).toThrow(CognitiveTransitionError);
  });
});

describe("Lifecycle counters and stale events", () => {
  it("increments deliberations and verifications only on decisions", () => {
    const system2 = awaitingSystem2();
    expect(system2.deliberationsUsed).toBe(1);
    expect(transitionCognitiveState(system2, deliberationRequested()).deliberationsUsed).toBe(1);
    expect(transitionCognitiveState(system2, deliberationApplied()).deliberationsUsed).toBe(1);
    const verification = awaitingVerification();
    expect(verification.verificationsUsed).toBe(1);
    expect(transitionCognitiveState(verification, verificationRequested()).verificationsUsed).toBe(1);
  });

  it("resets actionsSinceLastDeliberation only when deliberation applies", () => {
    const afterAction = replayCognitiveEvents([...assessed(), decide("GO"), allowed(), toolDone()]);
    const system2 = replayCognitiveEvents([propose(), start(), complete(), decide("DELIBERATE")], afterAction);
    expect(system2.actionsSinceLastDeliberation).toBe(1);
    expect(transitionCognitiveState(system2, deliberationApplied()).actionsSinceLastDeliberation).toBe(0);
  });

  it("rejects stale deliberation and verification events after READY", () => {
    const readyAfterDeliberation = replayCognitiveEvents([...assessed(), decide("DELIBERATE"), deliberationApplied(), strategyShift()]);
    expect(() => transitionCognitiveState(readyAfterDeliberation, deliberationRequested())).toThrow(CognitiveTransitionError);
    const readyAfterVerification = replayCognitiveEvents([...assessed(), decide("VERIFY"), verificationCompleted()]);
    expect(() => transitionCognitiveState(readyAfterVerification, verificationCompleted())).toThrow(CognitiveTransitionError);
  });

  it("does not accept new candidate while strategy shift remains pending", () => {
    expect(() => transitionCognitiveState(awaitingShift(), propose(B))).toThrow(CognitiveTransitionError);
  });
});

describe("Degraded state", () => {
  const sourceStates: readonly [string, () => CognitiveState][] = [
    ["READY", initialCognitiveState],
    ["ASSESSING", () => replayCognitiveEvents([propose()])],
    ["EXECUTING", executing],
    ["AWAITING_SYSTEM2", awaitingSystem2],
    ["AWAITING_STRATEGY_SHIFT", awaitingShift],
    ["AWAITING_VERIFICATION", awaitingVerification],
  ];

  it.each(sourceStates)("preserves coherent diagnostic metadata from %s", (_name, create) => {
    const before = create();
    const after = transitionCognitiveState(before, degraded("interrupted"));
    expect(after).toEqual({ ...before, phase: "DEGRADED", degradedReason: "interrupted" });
    assertCognitiveStateInvariant(after);
  });
});

describe("Runtime invariants and serialization", () => {
  const invalid = (changes: Record<string, unknown>) => ({ ...initialCognitiveState(), ...changes } as unknown as CognitiveState);

  it("rejects malformed state fields at runtime", () => {
    const cases: readonly CognitiveState[] = [
      invalid({ phase: "UNKNOWN" }),
      invalid({ activeCandidateId: A }),
      invalid({ pendingDeliberationCandidateId: A }),
      invalid({ pendingVerificationCandidateId: A }),
      invalid({ activeCandidateId: "" }),
      invalid({ step: -1 }),
      invalid({ step: 0.5 }),
      invalid({ step: Number.NaN }),
      invalid({ lastDecision: "MAYBE" }),
      invalid({ lastAssessment: {} }),
      invalid({ recentAssessments: [{}] }),
      invalid({ recentAssessments: Array(MAX_RECENT_COGNITIVE_ASSESSMENTS + 1).fill(assessment()) }),
      invalid({ hasCompletedAssessment: "true" }),
      invalid({ executionAuthorized: true }),
    ];
    for (const state of cases) expect(() => assertCognitiveStateInvariant(state)).toThrow(CognitiveStateInvariantError);
  });

  it("rejects all seven phase contradictions", () => {
    const cases: readonly CognitiveState[] = [
      invalid({ phase: "READY", activeCandidateId: A }),
      invalid({ phase: "ASSESSING", activeCandidateId: null }),
      invalid({ phase: "EXECUTING", activeCandidateId: null }),
      invalid({ phase: "AWAITING_SYSTEM2", activeCandidateId: A, pendingDeliberationCandidateId: B, hasCompletedAssessment: true }),
      invalid({ phase: "AWAITING_STRATEGY_SHIFT", activeCandidateId: A, pendingDeliberationCandidateId: A, hasCompletedAssessment: true, awaitingStrategyShift: false }),
      invalid({ phase: "AWAITING_VERIFICATION", activeCandidateId: A, pendingVerificationCandidateId: B, hasCompletedAssessment: true }),
      invalid({ phase: "DEGRADED", activeCandidateId: A, pendingDeliberationCandidateId: B }),
    ];
    for (const state of cases) expect(() => assertCognitiveStateInvariant(state)).toThrow(CognitiveStateInvariantError);
  });

  it("serializes and rehydrates valid states from every phase", () => {
    const states = [initialCognitiveState(), replayCognitiveEvents([propose()]), executing(), awaitingSystem2(), awaitingShift(), awaitingVerification(), transitionCognitiveState(executing(), degraded())];
    for (const state of states) {
      const parsed = JSON.parse(JSON.stringify(state)) as CognitiveState;
      expect(parsed).toEqual(state);
      assertCognitiveStateInvariant(parsed);
    }
  });

  it("bounds reducer assessment history to newest assessments", () => {
    let state = initialCognitiveState();
    for (let index = 0; index <= MAX_RECENT_COGNITIVE_ASSESSMENTS; index++) {
      state = replayCognitiveEvents([propose(), start(), complete(A, assessment(index / 100)), decide("BLOCK")], state);
    }
    expect(state.recentAssessments).toHaveLength(MAX_RECENT_COGNITIVE_ASSESSMENTS);
    expect(state.recentAssessments[0].progress.progressProbability).toBeCloseTo(0.01);
    assertCognitiveStateInvariant(state);
  });
});

describe("Replay, failure atomicity, and ownership", () => {
  const happyPaths: readonly (readonly CognitiveEvent[])[] = [
    [...assessed(), decide("GO"), allowed(), toolDone()],
    [...assessed(), decide("DELIBERATE"), deliberationRequested(), deliberationApplied(), strategyShift()],
    [...assessed(), decide("VERIFY"), verificationRequested(), verificationCompleted()],
    [...assessed(), decide("BLOCK")],
  ];

  it("matches incremental replay at every prefix of every happy path", () => {
    for (const events of happyPaths) {
      let incremental = initialCognitiveState();
      for (let index = 0; index < events.length; index++) {
        incremental = transitionCognitiveState(incremental, events[index]);
        expect(replayCognitiveEvents(events.slice(0, index + 1))).toEqual(incremental);
      }
    }
  });

  it("leaves state and invalid event unchanged on representative failures from every phase", () => {
    const cases: readonly [CognitiveState, CognitiveEvent][] = [
      [initialCognitiveState(), toolDone()],
      [replayCognitiveEvents([propose()]), decide("GO")],
      [executing(), toolDone()],
      [awaitingSystem2(), verificationCompleted()],
      [awaitingShift(), propose(B)],
      [awaitingVerification(), deliberationApplied()],
      [transitionCognitiveState(initialCognitiveState(), degraded()), propose()],
    ];
    for (const [state, invalidEvent] of cases) {
      const stateBefore = JSON.parse(JSON.stringify(state));
      const eventBefore = JSON.parse(JSON.stringify(invalidEvent));
      expect(() => transitionCognitiveState(state, invalidEvent)).toThrow(CognitiveTransitionError);
      expect(state).toEqual(stateBefore);
      expect(invalidEvent).toEqual(eventBefore);
    }
  });

  it("defensively owns assessment values and assessment buffers", () => {
    const callerAssessment = assessment(0.4);
    const state1 = replayCognitiveEvents([propose(), start(), complete(A, callerAssessment)]);
    callerAssessment.progress.progressProbability = p(0.99);
    expect(state1.lastAssessment?.progress.progressProbability).toBe(0.4);

    const state2 = replayCognitiveEvents([start(), complete(A, assessment(0.6))], state1);
    expect(() => { (state2.recentAssessments[0].progress as { progressProbability: Probability }).progressProbability = p(0.99); }).toThrow();
    expect(state1.recentAssessments[0].progress.progressProbability).toBe(0.4);
  });
});

describe("Transition legality matrix", () => {
  const phases: readonly [string, () => CognitiveState][] = [
    ["READY", initialCognitiveState],
    ["ASSESSING_UNASSESSED", () => replayCognitiveEvents([propose()])],
    ["ASSESSING_IN_PROGRESS", () => replayCognitiveEvents([propose(), start()])],
    ["ASSESSING_ASSESSED", () => replayCognitiveEvents(assessed())],
    ["EXECUTING_UNAUTHORIZED", executing],
    ["EXECUTING_AUTHORIZED", () => transitionCognitiveState(executing(), allowed())],
    ["AWAITING_SYSTEM2", awaitingSystem2],
    ["AWAITING_STRATEGY_SHIFT", awaitingShift],
    ["AWAITING_VERIFICATION", awaitingVerification],
    ["DEGRADED", () => transitionCognitiveState(executing(), degraded())],
  ];
  const events: Record<CognitiveEvent["type"], () => CognitiveEvent> = {
    CANDIDATE_PROPOSED: propose,
    ASSESSMENT_STARTED: start,
    ASSESSMENT_COMPLETED: complete,
    COGNITIVE_DECISION: () => decide("GO"),
    DELIBERATION_REQUESTED: deliberationRequested,
    DELIBERATION_APPLIED: deliberationApplied,
    STRATEGY_SHIFT_OBSERVED: strategyShift,
    VERIFICATION_REQUESTED: verificationRequested,
    VERIFICATION_COMPLETED: verificationCompleted,
    ACTION_ALLOWED: allowed,
    ACTION_BLOCKED: blocked,
    TOOL_COMPLETED: toolDone,
    COGNITIVE_RUNTIME_DEGRADED: degraded,
  };
  const legal = new Set([
    "READY:CANDIDATE_PROPOSED", "READY:COGNITIVE_RUNTIME_DEGRADED",
    "ASSESSING_UNASSESSED:ASSESSMENT_STARTED", "ASSESSING_UNASSESSED:COGNITIVE_RUNTIME_DEGRADED",
    "ASSESSING_IN_PROGRESS:ASSESSMENT_COMPLETED", "ASSESSING_IN_PROGRESS:COGNITIVE_RUNTIME_DEGRADED",
    "ASSESSING_ASSESSED:ASSESSMENT_STARTED", "ASSESSING_ASSESSED:COGNITIVE_DECISION", "ASSESSING_ASSESSED:COGNITIVE_RUNTIME_DEGRADED",
    "EXECUTING_UNAUTHORIZED:ACTION_ALLOWED", "EXECUTING_UNAUTHORIZED:COGNITIVE_RUNTIME_DEGRADED",
    "EXECUTING_AUTHORIZED:TOOL_COMPLETED", "EXECUTING_AUTHORIZED:COGNITIVE_RUNTIME_DEGRADED",
    "AWAITING_SYSTEM2:DELIBERATION_REQUESTED", "AWAITING_SYSTEM2:DELIBERATION_APPLIED", "AWAITING_SYSTEM2:COGNITIVE_RUNTIME_DEGRADED",
    "AWAITING_STRATEGY_SHIFT:STRATEGY_SHIFT_OBSERVED", "AWAITING_STRATEGY_SHIFT:COGNITIVE_RUNTIME_DEGRADED",
    "AWAITING_VERIFICATION:VERIFICATION_REQUESTED", "AWAITING_VERIFICATION:VERIFICATION_COMPLETED", "AWAITING_VERIFICATION:COGNITIVE_RUNTIME_DEGRADED",
  ]);

  it("accepts only explicitly legal phase/substate and event pairs", () => {
    for (const [name, createState] of phases) {
      for (const [type, createEvent] of Object.entries(events) as [CognitiveEvent["type"], () => CognitiveEvent][]) {
        const key = `${name}:${type}`;
        if (legal.has(key)) expect(() => transitionCognitiveState(createState(), createEvent())).not.toThrow();
        else expect(() => transitionCognitiveState(createState(), createEvent())).toThrow(CognitiveTransitionError);
      }
    }
  });
});

describe("Long-run deterministic lifecycle", () => {
  it("executes over 1,000 legal transitions with replay equivalence", () => {
    let seed = 0x6b8b4567;
    let transitions = 0;
    const next = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed; };

    while (transitions < 1000) {
      const candidate = `candidate-${next()}`;
      const mode = next() % 5;
      const events: CognitiveEvent[] = [propose(candidate), start(candidate)];
      if (mode === 4) events.push(degraded("isolated-runtime-failure"));
      else {
        events.push(complete(candidate));
        if (mode === 0) events.push(decide("GO", candidate), allowed(candidate), toolDone(candidate));
        if (mode === 1) events.push(decide("DELIBERATE", candidate), deliberationRequested(candidate), deliberationApplied(candidate), strategyShift(candidate));
        if (mode === 2) events.push(decide("VERIFY", candidate), verificationRequested(candidate), verificationCompleted(candidate));
        if (mode === 3) events.push(decide("BLOCK", candidate));
      }
      let incremental = initialCognitiveState();
      for (const current of events) {
        incremental = transitionCognitiveState(incremental, current);
        assertCognitiveStateInvariant(incremental);
        transitions++;
      }
      expect(replayCognitiveEvents(events)).toEqual(incremental);
    }
    expect(transitions).toBeGreaterThanOrEqual(1000);
  });
});
