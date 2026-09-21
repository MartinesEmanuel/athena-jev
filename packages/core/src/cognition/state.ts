import type { CognitiveAssessment } from "./assessment.js";
import { assertCognitiveAssessment } from "./assessment.js";
import { isValidDecision, type Decision } from "./decision.js";

// ── Phase ────────────────────────────────────────────────────────────

export type CognitivePhase =
  | "READY"
  | "ASSESSING"
  | "EXECUTING"
  | "AWAITING_SYSTEM2"
  | "AWAITING_STRATEGY_SHIFT"
  | "AWAITING_VERIFICATION"
  | "DEGRADED";

export const COGNITIVE_PHASES: readonly CognitivePhase[] = [
  "READY",
  "ASSESSING",
  "EXECUTING",
  "AWAITING_SYSTEM2",
  "AWAITING_STRATEGY_SHIFT",
  "AWAITING_VERIFICATION",
  "DEGRADED",
] as const;

export function isValidCognitivePhase(value: unknown): value is CognitivePhase {
  return (COGNITIVE_PHASES as readonly string[]).includes(value as string);
}

// ── Errors ───────────────────────────────────────────────────────────

export class CognitiveTransitionError extends Error {
  readonly phase: CognitivePhase;
  readonly eventType: string;

  constructor(message: string, phase: CognitivePhase, eventType: string) {
    super(message);
    this.name = "CognitiveTransitionError";
    this.phase = phase;
    this.eventType = eventType;
  }
}

export class CognitiveStateInvariantError extends Error {
  readonly phase: CognitivePhase;
  readonly constraint: string;

  constructor(message: string, phase: CognitivePhase, constraint: string) {
    super(message);
    this.name = "CognitiveStateInvariantError";
    this.phase = phase;
    this.constraint = constraint;
  }
}

// ── Buffer bound ─────────────────────────────────────────────────────

/**
 * Maximum recent assessments retained in state.
 * Chosen as 16: enough for trend analysis across a session,
 * small enough to keep state serialization cheap.
 */
export const MAX_RECENT_COGNITIVE_ASSESSMENTS = 16;

// ── State ────────────────────────────────────────────────────────────

export interface CognitiveState {
  readonly phase: CognitivePhase;
  readonly activeCandidateId: string | null;
  readonly pendingDeliberationCandidateId: string | null;
  readonly pendingVerificationCandidateId: string | null;
  readonly lastAssessment: CognitiveAssessment | null;
  readonly lastDecision: Decision | null;
  readonly step: number;
  readonly consecutiveLowProgress: number;
  readonly consecutiveLowInformationGain: number;
  readonly consecutiveHighStagnation: number;
  readonly actionsSinceLastDeliberation: number;
  readonly deliberationsUsed: number;
  readonly verificationsUsed: number;
  readonly blocks: number;
  readonly awaitingStrategyShift: boolean;
  readonly recentAssessments: readonly CognitiveAssessment[];
  readonly degradedReason: string | null;
  readonly hasCompletedAssessment: boolean;
  readonly assessmentInProgress: boolean;
  readonly executionAuthorized: boolean;
}

export function initialCognitiveState(): CognitiveState {
  return {
    phase: "READY",
    activeCandidateId: null,
    pendingDeliberationCandidateId: null,
    pendingVerificationCandidateId: null,
    lastAssessment: null,
    lastDecision: null,
    step: 0,
    consecutiveLowProgress: 0,
    consecutiveLowInformationGain: 0,
    consecutiveHighStagnation: 0,
    actionsSinceLastDeliberation: 0,
    deliberationsUsed: 0,
    verificationsUsed: 0,
    blocks: 0,
    awaitingStrategyShift: false,
    recentAssessments: Object.freeze([]),
    degradedReason: null,
    hasCompletedAssessment: false,
    assessmentInProgress: false,
    executionAuthorized: false,
  };
}

// ── Invariants ───────────────────────────────────────────────────────

function assertNonNegativeInteger(value: unknown, field: string, phase: CognitivePhase): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new CognitiveStateInvariantError(
      `${field} must be non-negative integer, got ${value}`,
      phase,
      field,
    );
  }
}

function assertAssessment(value: unknown, field: string, phase: CognitivePhase): void {
  try {
    assertCognitiveAssessment(value);
  } catch {
    invariantError(`${field} must be a valid CognitiveAssessment`, phase, field);
  }
}

function assertBoundedRecentAssessments(
  recent: unknown,
  phase: CognitivePhase,
): asserts recent is readonly CognitiveAssessment[] {
  if (!Array.isArray(recent)) {
    invariantError("recentAssessments must be an array", phase, "recentAssessments");
  }
  if (recent.length > MAX_RECENT_COGNITIVE_ASSESSMENTS) {
    throw new CognitiveStateInvariantError(
      `recentAssessments length ${recent.length} exceeds bound ${MAX_RECENT_COGNITIVE_ASSESSMENTS}`,
      phase,
      "recentAssessments",
    );
  }
  for (let i = 0; i < recent.length; i++) {
    assertAssessment(recent[i], `recentAssessments[${i}]`, phase);
  }
}

function assertCandidateId(value: unknown, field: string, phase: CognitivePhase): void {
  if (value !== null && (typeof value !== "string" || value.trim().length === 0)) {
    invariantError(`${field} must be null or non-empty string`, phase, field);
  }
}

function assertBoolean(value: unknown, field: string, phase: CognitivePhase): void {
  if (typeof value !== "boolean") {
    invariantError(`${field} must be boolean`, phase, field);
  }
}

function invariantError(
  message: string,
  phase: CognitivePhase,
  constraint: string,
): never {
  throw new CognitiveStateInvariantError(message, phase, constraint);
}

export function assertCognitiveStateInvariant(state: CognitiveState): void {
  const phase = state.phase as CognitivePhase;
  if (!isValidCognitivePhase(phase)) {
    invariantError(`Invalid phase: ${String(state.phase)}`, phase, "phase");
  }

  // Common counter checks
  assertNonNegativeInteger(state.step, "step", phase);
  assertNonNegativeInteger(state.consecutiveLowProgress, "consecutiveLowProgress", phase);
  assertNonNegativeInteger(state.consecutiveLowInformationGain, "consecutiveLowInformationGain", phase);
  assertNonNegativeInteger(state.consecutiveHighStagnation, "consecutiveHighStagnation", phase);
  assertNonNegativeInteger(state.actionsSinceLastDeliberation, "actionsSinceLastDeliberation", phase);
  assertNonNegativeInteger(state.deliberationsUsed, "deliberationsUsed", phase);
  assertNonNegativeInteger(state.verificationsUsed, "verificationsUsed", phase);
  assertNonNegativeInteger(state.blocks, "blocks", phase);
  assertCandidateId(state.activeCandidateId, "activeCandidateId", phase);
  assertCandidateId(state.pendingDeliberationCandidateId, "pendingDeliberationCandidateId", phase);
  assertCandidateId(state.pendingVerificationCandidateId, "pendingVerificationCandidateId", phase);
  assertBoolean(state.awaitingStrategyShift, "awaitingStrategyShift", phase);
  assertBoolean(state.hasCompletedAssessment, "hasCompletedAssessment", phase);
  assertBoolean(state.assessmentInProgress, "assessmentInProgress", phase);
  assertBoolean(state.executionAuthorized, "executionAuthorized", phase);
  if (state.lastAssessment !== null) {
    assertAssessment(state.lastAssessment, "lastAssessment", phase);
  }
  if (state.lastDecision !== null && !isValidDecision(state.lastDecision)) {
    invariantError("lastDecision must be null or valid Decision", phase, "lastDecision");
  }
  if (state.degradedReason !== null && (typeof state.degradedReason !== "string" || state.degradedReason.trim().length === 0)) {
    invariantError("degradedReason must be null or non-empty string", phase, "degradedReason");
  }

  // No simultaneous pending deliberation and verification
  if (state.pendingDeliberationCandidateId !== null && state.pendingVerificationCandidateId !== null) {
    invariantError(
      "Cannot have both pendingDeliberationCandidateId and pendingVerificationCandidateId",
      phase,
      "mutual-exclusion",
    );
  }

  // Recent assessments bounded
  assertBoundedRecentAssessments(state.recentAssessments, phase);

  switch (phase) {
    case "READY":
      if (state.activeCandidateId !== null)
        invariantError("READY: activeCandidateId must be null", phase, "activeCandidateId");
      if (state.pendingDeliberationCandidateId !== null)
        invariantError("READY: pendingDeliberationCandidateId must be null", phase, "pendingDeliberationCandidateId");
      if (state.pendingVerificationCandidateId !== null)
        invariantError("READY: pendingVerificationCandidateId must be null", phase, "pendingVerificationCandidateId");
      if (state.awaitingStrategyShift)
        invariantError("READY: awaitingStrategyShift must be false", phase, "awaitingStrategyShift");
      if (state.hasCompletedAssessment)
        invariantError("READY: hasCompletedAssessment must be false", phase, "hasCompletedAssessment");
      if (state.assessmentInProgress)
        invariantError("READY: assessmentInProgress must be false", phase, "assessmentInProgress");
      if (state.executionAuthorized)
        invariantError("READY: executionAuthorized must be false", phase, "executionAuthorized");
      break;

    case "ASSESSING":
      if (state.activeCandidateId === null)
        invariantError("ASSESSING: activeCandidateId must not be null", phase, "activeCandidateId");
      if (state.pendingDeliberationCandidateId !== null || state.pendingVerificationCandidateId !== null)
        invariantError("ASSESSING: no candidate may be pending", phase, "pendingCandidate");
      if (state.awaitingStrategyShift || state.executionAuthorized)
        invariantError("ASSESSING: awaitingStrategyShift and executionAuthorized must be false", phase, "lifecycle-flags");
      break;

    case "EXECUTING":
      if (state.activeCandidateId === null)
        invariantError("EXECUTING: activeCandidateId must not be null", phase, "activeCandidateId");
      if (!state.hasCompletedAssessment)
        invariantError("EXECUTING: hasCompletedAssessment must be true", phase, "hasCompletedAssessment");
      if (state.assessmentInProgress)
        invariantError("EXECUTING: assessmentInProgress must be false", phase, "assessmentInProgress");
      if (state.pendingDeliberationCandidateId !== null || state.pendingVerificationCandidateId !== null || state.awaitingStrategyShift)
        invariantError("EXECUTING: no deliberation or verification may be pending", phase, "pendingCandidate");
      break;

    case "AWAITING_SYSTEM2":
      if (state.activeCandidateId === null)
        invariantError("AWAITING_SYSTEM2: activeCandidateId must not be null", phase, "activeCandidateId");
      if (state.pendingDeliberationCandidateId !== state.activeCandidateId)
        invariantError(
          "AWAITING_SYSTEM2: pendingDeliberationCandidateId must equal activeCandidateId",
          phase,
          "pendingDeliberationCandidateId",
        );
      if (!state.hasCompletedAssessment || state.assessmentInProgress || state.awaitingStrategyShift || state.executionAuthorized)
        invariantError("AWAITING_SYSTEM2: invalid lifecycle flags", phase, "lifecycle-flags");
      break;

    case "AWAITING_STRATEGY_SHIFT":
      if (!state.awaitingStrategyShift)
        invariantError("AWAITING_STRATEGY_SHIFT: awaitingStrategyShift must be true", phase, "awaitingStrategyShift");
      if (state.pendingDeliberationCandidateId === null)
        invariantError("AWAITING_STRATEGY_SHIFT: pendingDeliberationCandidateId must not be null", phase, "pendingDeliberationCandidateId");
      if (state.activeCandidateId !== state.pendingDeliberationCandidateId)
        invariantError("AWAITING_STRATEGY_SHIFT: pendingDeliberationCandidateId must equal activeCandidateId", phase, "pendingDeliberationCandidateId");
      if (!state.hasCompletedAssessment || state.assessmentInProgress || state.executionAuthorized)
        invariantError("AWAITING_STRATEGY_SHIFT: invalid lifecycle flags", phase, "lifecycle-flags");
      break;

    case "AWAITING_VERIFICATION":
      if (state.activeCandidateId === null)
        invariantError("AWAITING_VERIFICATION: activeCandidateId must not be null", phase, "activeCandidateId");
      if (state.pendingVerificationCandidateId !== state.activeCandidateId)
        invariantError(
          "AWAITING_VERIFICATION: pendingVerificationCandidateId must equal activeCandidateId",
          phase,
          "pendingVerificationCandidateId",
        );
      if (!state.hasCompletedAssessment || state.assessmentInProgress || state.awaitingStrategyShift || state.executionAuthorized)
        invariantError("AWAITING_VERIFICATION: invalid lifecycle flags", phase, "lifecycle-flags");
      break;

    case "DEGRADED":
      if (state.pendingDeliberationCandidateId !== null && state.pendingDeliberationCandidateId !== state.activeCandidateId)
        invariantError("DEGRADED: pendingDeliberationCandidateId must equal activeCandidateId", phase, "pendingDeliberationCandidateId");
      if (state.pendingVerificationCandidateId !== null && state.pendingVerificationCandidateId !== state.activeCandidateId)
        invariantError("DEGRADED: pendingVerificationCandidateId must equal activeCandidateId", phase, "pendingVerificationCandidateId");
      if (state.awaitingStrategyShift && state.pendingDeliberationCandidateId === null)
        invariantError("DEGRADED: awaitingStrategyShift requires pending deliberation", phase, "awaitingStrategyShift");
      if (state.executionAuthorized && (!state.hasCompletedAssessment || state.activeCandidateId === null))
        invariantError("DEGRADED: executionAuthorized requires assessed active candidate", phase, "executionAuthorized");
      break;

    default: {
      const _exhaustive: never = phase;
      invariantError(`Unknown phase: ${String(_exhaustive)}`, _exhaustive as CognitivePhase, "phase");
    }
  }
}
