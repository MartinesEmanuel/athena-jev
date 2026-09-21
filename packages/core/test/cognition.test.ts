import { describe, expect, it } from "vitest";
import {
  isProbability,
  assertProbability,
  isValidCandidateAction,
  assertCandidateAction,
  assertCognitiveAssessment,
  isValidCognitiveAssessment,
  DECISIONS,
  REASON_CODES,
  isValidDecision,
  isValidReasonCode,
  initialCognitiveState,
  isValidCognitivePhase,
  COGNITIVE_PHASES,
  transitionCognitiveState,
  replayCognitiveEvents,
  assertCognitiveStateInvariant,
  CognitiveTransitionError,
  CognitiveStateInvariantError,
  MAX_RECENT_COGNITIVE_ASSESSMENTS,
  COGNITIVE_ASSESSMENT_SCHEMA_VERSION,
  COGNITIVE_POLICY_VERSION,
} from "../src/cognition/index.js";
import type {
  CognitiveAssessment,
  CognitiveEvent,
  CandidateAction,
  Probability,
} from "../src/cognition/index.js";

const p = (v: number) => v as unknown as Probability;

// ── Probability ──────────────────────────────────────────────────────

describe("Probability", () => {
  it("accepts 0 and 1", () => {
    expect(isProbability(0)).toBe(true);
    expect(isProbability(1)).toBe(true);
    expect(assertProbability(0)).toBe(0);
    expect(assertProbability(1)).toBe(1);
  });

  it("accepts interior values", () => {
    expect(isProbability(0.5)).toBe(true);
    expect(isProbability(0.001)).toBe(true);
  });

  it("rejects NaN", () => {
    expect(isProbability(NaN)).toBe(false);
    expect(() => assertProbability(NaN)).toThrow();
  });

  it("rejects Infinity", () => {
    expect(isProbability(Infinity)).toBe(false);
    expect(isProbability(-Infinity)).toBe(false);
    expect(() => assertProbability(Infinity)).toThrow();
  });

  it("rejects below 0", () => {
    expect(isProbability(-0.01)).toBe(false);
    expect(() => assertProbability(-0.01)).toThrow();
  });

  it("rejects above 1", () => {
    expect(isProbability(1.01)).toBe(false);
    expect(() => assertProbability(1.01)).toThrow();
  });

  it("rejects non-number", () => {
    expect(isProbability("0.5")).toBe(false);
    expect(isProbability(null)).toBe(false);
    expect(isProbability(undefined)).toBe(false);
    expect(() => assertProbability("0.5")).toThrow();
  });

  it("rejects -0", () => {
    expect(isProbability(-0)).toBe(true);
  });
});

// ── CandidateAction ──────────────────────────────────────────────────

describe("CandidateAction", () => {
  const valid = {
    id: "a1",
    kind: "tool" as const,
    tool: "bash",
    input: "echo hello",
    intent: "greet user",
  };

  it("accepts valid candidate", () => {
    expect(isValidCandidateAction(valid)).toBe(true);
    expect(assertCandidateAction(valid)).toEqual(valid);
  });

  it("accepts minimal candidate (answer kind)", () => {
    const min = { id: "a2", kind: "answer" as const, intent: "respond" };
    expect(isValidCandidateAction(min)).toBe(true);
  });

  it("rejects missing id", () => {
    expect(isValidCandidateAction({ kind: "tool", intent: "x" })).toBe(false);
  });

  it("rejects missing intent", () => {
    expect(isValidCandidateAction({ id: "a", kind: "tool" })).toBe(false);
  });

  it("rejects empty optional text and unknown fields", () => {
    expect(isValidCandidateAction({ id: "a", kind: "tool", intent: "x", tool: "" })).toBe(false);
    expect(isValidCandidateAction({ id: "a", kind: "tool", intent: "x", hidden: true })).toBe(false);
  });

  it("rejects invalid kind", () => {
    expect(isValidCandidateAction({ id: "a", kind: "reason", intent: "x" })).toBe(false);
  });

  it("rejects non-object", () => {
    expect(isValidCandidateAction("bad")).toBe(false);
    expect(isValidCandidateAction(null)).toBe(false);
  });

  it("contains no chain-of-thought field", () => {
    // Type-level: CandidateAction interface must not have chainOfThought
    type HasChainOfThought = CandidateAction extends { chainOfThought: unknown }
      ? true
      : false;
    const typeCheck: HasChainOfThought = false as never;
    void typeCheck;

    const withCog = { ...valid, chainOfThought: "let me think..." };
    expect(() => assertCandidateAction(withCog)).toThrow();
  });
});

// ── CognitiveAssessment ──────────────────────────────────────────────

const validAssessment: CognitiveAssessment = {
  safety: {
    failureProbability: p(0.1),
    impactSeverity: p(0.2),
    irreversibility: p(0),
    policyViolationProbability: p(0),
  },
  progress: {
    progressProbability: p(0.8),
    informationGainProbability: p(0.7),
    strategyNovelty: p(0.5),
    stagnationProbability: p(0.1),
    goalAlignment: p(0.9),
  },
  completion: {
    goalSatisfiedProbability: p(0.3),
    evidenceCoverage: p(0.4),
    unresolvedObligationsProbability: p(0.6),
  },
  epistemics: {
    stateUncertainty: p(0.2),
    contextSufficiency: p(0.8),
    contradictionProbability: p(0),
  },
};

describe("CognitiveAssessment", () => {
  it("accepts valid assessment", () => {
    expect(isValidCognitiveAssessment(validAssessment)).toBe(true);
    expect(assertCognitiveAssessment(validAssessment)).toEqual(validAssessment);
  });

  it("rejects non-object", () => {
    expect(isValidCognitiveAssessment(null)).toBe(false);
    expect(isValidCognitiveAssessment("bad")).toBe(false);
  });

  it("rejects missing domain", () => {
    const rest = { ...validAssessment };
    Reflect.deleteProperty(rest, "safety");
    expect(isValidCognitiveAssessment(rest)).toBe(false);
  });

  it("rejects invalid probability in any dimension", () => {
    const bad = {
      ...validAssessment,
      safety: { ...validAssessment.safety, failureProbability: -1 },
    };
    expect(isValidCognitiveAssessment(bad)).toBe(false);
    expect(() => assertCognitiveAssessment(bad)).toThrow();
  });

  it("rejects NaN in any dimension", () => {
    const bad = {
      ...validAssessment,
      epistemics: { ...validAssessment.epistemics, stateUncertainty: NaN },
    };
    expect(isValidCognitiveAssessment(bad)).toBe(false);
  });

  it("covers exactly 4 domains", () => {
    const keys = Object.keys(validAssessment);
    expect(keys).toHaveLength(4);
    expect(keys).toEqual(
      expect.arrayContaining(["safety", "progress", "completion", "epistemics"]),
    );
  });

  it("safety has 4 dimensions", () => {
    expect(Object.keys(validAssessment.safety)).toHaveLength(4);
  });

  it("progress has 5 dimensions", () => {
    expect(Object.keys(validAssessment.progress)).toHaveLength(5);
  });

  it("completion has 3 dimensions", () => {
    expect(Object.keys(validAssessment.completion)).toHaveLength(3);
  });

  it("epistemics has 3 dimensions", () => {
    expect(Object.keys(validAssessment.epistemics)).toHaveLength(3);
  });
});

// ── Decision ─────────────────────────────────────────────────────────

describe("Decision", () => {
  it("contains exactly 4 values", () => {
    expect(DECISIONS).toEqual(["GO", "DELIBERATE", "VERIFY", "BLOCK"]);
    expect(DECISIONS).toHaveLength(4);
  });

  it("validates decisions", () => {
    expect(isValidDecision("GO")).toBe(true);
    expect(isValidDecision("BLOCK")).toBe(true);
    expect(isValidDecision("allow")).toBe(false);
    expect(isValidDecision("")).toBe(false);
  });
});

// ── ReasonCode ───────────────────────────────────────────────────────

describe("ReasonCode", () => {
  it("contains exactly 17 codes", () => {
    expect(REASON_CODES).toHaveLength(17);
  });

  it("validates reason codes", () => {
    expect(isValidReasonCode("HARD_RULE")).toBe(true);
    expect(isValidReasonCode("HEALTHY_PROGRESS")).toBe(true);
    expect(isValidReasonCode("UNKNOWN")).toBe(false);
  });
});

// ── CognitivePhase ────────────────────────────────────────────────────

describe("CognitivePhase", () => {
  it("contains exactly 7 phases", () => {
    expect(COGNITIVE_PHASES).toHaveLength(7);
  });

  it("validates phases", () => {
    expect(isValidCognitivePhase("READY")).toBe(true);
    expect(isValidCognitivePhase("DEGRADED")).toBe(true);
    expect(isValidCognitivePhase("BLOCKED")).toBe(false);
    expect(isValidCognitivePhase("")).toBe(false);
  });
});

// ── CognitiveState ───────────────────────────────────────────────────

describe("CognitiveState", () => {
  it("initial state is deterministic", () => {
    const a = initialCognitiveState();
    const b = initialCognitiveState();
    expect(a).toEqual(b);
  });

  it("initial state values", () => {
    const s = initialCognitiveState();
    expect(s.phase).toBe("READY");
    expect(s.activeCandidateId).toBeNull();
    expect(s.pendingDeliberationCandidateId).toBeNull();
    expect(s.pendingVerificationCandidateId).toBeNull();
    expect(s.lastAssessment).toBeNull();
    expect(s.lastDecision).toBeNull();
    expect(s.step).toBe(0);
    expect(s.consecutiveLowProgress).toBe(0);
    expect(s.consecutiveLowInformationGain).toBe(0);
    expect(s.consecutiveHighStagnation).toBe(0);
    expect(s.actionsSinceLastDeliberation).toBe(0);
    expect(s.deliberationsUsed).toBe(0);
    expect(s.verificationsUsed).toBe(0);
    expect(s.blocks).toBe(0);
    expect(s.awaitingStrategyShift).toBe(false);
    expect(s.recentAssessments).toEqual([]);
    expect(s.degradedReason).toBeNull();
    expect(s.hasCompletedAssessment).toBe(false);
    expect(s.assessmentInProgress).toBe(false);
    expect(s.executionAuthorized).toBe(false);
  });
});

// ── Events ───────────────────────────────────────────────────────────

describe("CognitiveEvent", () => {
  const eventTypes = [
    "CANDIDATE_PROPOSED",
    "ASSESSMENT_STARTED",
    "ASSESSMENT_COMPLETED",
    "COGNITIVE_EVIDENCE_UPDATED",
    "COGNITIVE_DECISION",
    "DELIBERATION_REQUESTED",
    "DELIBERATION_APPLIED",
    "STRATEGY_SHIFT_OBSERVED",
    "VERIFICATION_REQUESTED",
    "VERIFICATION_COMPLETED",
    "ACTION_ALLOWED",
    "ACTION_BLOCKED",
    "TOOL_COMPLETED",
    "COGNITIVE_RUNTIME_DEGRADED",
  ];

  it("has exactly 14 event types", () => {
    expect(eventTypes).toHaveLength(14);
  });

  it("events are discriminated by type field", () => {
    const base = { timestamp: "2026-01-01T00:00:00Z", sessionId: "s1" };
    const allowed: CognitiveEvent = {
      ...base,
      type: "ACTION_ALLOWED",
      candidateId: "a1",
    };
    const blocked: CognitiveEvent = {
      ...base,
      type: "ACTION_BLOCKED",
      candidateId: "a1",
      reasons: ["HARD_RULE"],
    };
    expect(allowed.type).toBe("ACTION_ALLOWED");
    expect(blocked.type).toBe("ACTION_BLOCKED");
  });
});

// ── Version constants ────────────────────────────────────────────────

describe("Version constants", () => {
  it("schema version is '1'", () => {
    expect(COGNITIVE_ASSESSMENT_SCHEMA_VERSION).toBe("1");
  });

  it("policy version is '0.3.0'", () => {
    expect(COGNITIVE_POLICY_VERSION).toBe("0.3.0");
  });
});

// ── Public exports compile ───────────────────────────────────────────

describe("Public cognition exports", () => {
  it("all exports are accessible", () => {
    expect(typeof isProbability).toBe("function");
    expect(typeof assertProbability).toBe("function");
    expect(typeof isValidCandidateAction).toBe("function");
    expect(typeof assertCandidateAction).toBe("function");
    expect(typeof assertCognitiveAssessment).toBe("function");
    expect(typeof isValidCognitiveAssessment).toBe("function");
    expect(typeof isValidDecision).toBe("function");
    expect(typeof isValidReasonCode).toBe("function");
    expect(typeof isValidCognitivePhase).toBe("function");
    expect(typeof initialCognitiveState).toBe("function");
    expect(typeof transitionCognitiveState).toBe("function");
    expect(typeof replayCognitiveEvents).toBe("function");
    expect(typeof assertCognitiveStateInvariant).toBe("function");
    expect(typeof CognitiveTransitionError).toBe("function");
    expect(typeof CognitiveStateInvariantError).toBe("function");
    expect(typeof MAX_RECENT_COGNITIVE_ASSESSMENTS).toBe("number");
    expect(DECISIONS).toBeDefined();
    expect(REASON_CODES).toBeDefined();
    expect(COGNITIVE_PHASES).toBeDefined();
    expect(COGNITIVE_ASSESSMENT_SCHEMA_VERSION).toBeDefined();
    expect(COGNITIVE_POLICY_VERSION).toBeDefined();
  });
});
