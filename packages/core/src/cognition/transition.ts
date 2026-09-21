import type { CognitiveAssessment } from "./assessment.js";
import { assertCognitiveAssessment } from "./assessment.js";
import { isValidDecision } from "./decision.js";
import type { CognitiveEvent } from "./events.js";
import {
  CognitiveTransitionError,
  MAX_RECENT_COGNITIVE_ASSESSMENTS,
} from "./state.js";
import type { CognitiveState } from "./state.js";
import { assertCognitiveStateInvariant, initialCognitiveState } from "./state.js";

// ── Pure transition ──────────────────────────────────────────────────

function requirePhase(state: CognitiveState, expected: string, eventType: string): void {
  if (state.phase !== expected) {
    throw new CognitiveTransitionError(
      `Expected phase ${expected}, got ${state.phase}`,
      state.phase,
      eventType,
    );
  }
}

function requireCandidate(
  event: { candidateId?: string },
  activeCandidateId: string | null,
  state: CognitiveState,
): string {
  if (!("candidateId" in event) || typeof event.candidateId !== "string") {
    throw new CognitiveTransitionError(
      `Event requires candidateId`,
      state.phase,
      "candidate-id-required",
    );
  }
  const cid = event.candidateId;
  if (cid.trim().length === 0) {
    throw new CognitiveTransitionError(
      "candidateId must be non-empty string",
      state.phase,
      "candidate-id-invalid",
    );
  }
  if (activeCandidateId !== null && cid !== activeCandidateId) {
    throw new CognitiveTransitionError(
      `Candidate ID mismatch: event=${cid}, active=${activeCandidateId}`,
      state.phase,
      "candidate-id-mismatch",
    );
  }
  return cid;
}

function freezeAssessment(assessment: CognitiveAssessment): CognitiveAssessment {
  Object.freeze(assessment.safety);
  Object.freeze(assessment.progress);
  Object.freeze(assessment.completion);
  Object.freeze(assessment.epistemics);
  return Object.freeze(assessment);
}

function cloneAssessment(value: CognitiveAssessment): CognitiveAssessment {
  return freezeAssessment(assertCognitiveAssessment(value));
}

function appendAssessment(
  recent: readonly CognitiveAssessment[],
  assessment: CognitiveAssessment,
): readonly CognitiveAssessment[] {
  const next = [...recent.map(cloneAssessment), cloneAssessment(assessment)];
  return Object.freeze(next.slice(-MAX_RECENT_COGNITIVE_ASSESSMENTS));
}

const TERMINAL_PHASES = new Set<string>(["DEGRADED"]);

export function transitionCognitiveState(
  state: CognitiveState,
  event: CognitiveEvent,
): CognitiveState {
  assertCognitiveStateInvariant(state);
  const { phase } = state;

  switch (event.type) {
    // ── CANDIDATE_PROPOSED ───────────────────────────────────────
    case "CANDIDATE_PROPOSED": {
      requirePhase(state, "READY", event.type);
      requireCandidate(event, null, state);
      return {
        ...state,
        phase: "ASSESSING",
        activeCandidateId: event.candidateId,
        hasCompletedAssessment: false,
        assessmentInProgress: false,
        executionAuthorized: false,
      };
    }

    // ── ASSESSMENT_STARTED ───────────────────────────────────────
    case "ASSESSMENT_STARTED": {
      requirePhase(state, "ASSESSING", event.type);
      requireCandidate(event, state.activeCandidateId, state);
      if (state.assessmentInProgress) {
        throw new CognitiveTransitionError(
          "ASSESSMENT_STARTED already accepted for active candidate",
          state.phase,
          event.type,
        );
      }
      return { ...state, assessmentInProgress: true };
    }

    // ── ASSESSMENT_COMPLETED ─────────────────────────────────────
    case "ASSESSMENT_COMPLETED": {
      requirePhase(state, "ASSESSING", event.type);
      requireCandidate(event, state.activeCandidateId, state);
      if (!state.assessmentInProgress) {
        throw new CognitiveTransitionError(
          "ASSESSMENT_COMPLETED requires ASSESSMENT_STARTED for active candidate",
          state.phase,
          event.type,
        );
      }
      const assessment = cloneAssessment(event.assessment);
      return {
        ...state,
        lastAssessment: assessment,
        recentAssessments: appendAssessment(state.recentAssessments, assessment),
        hasCompletedAssessment: true,
        assessmentInProgress: false,
      };
    }

    // ── COGNITIVE_DECISION ───────────────────────────────────────
    case "COGNITIVE_DECISION": {
      requirePhase(state, "ASSESSING", event.type);
      const cid = requireCandidate(event, state.activeCandidateId, state);
      const decision = event.gateResult.decision;
      if (!state.hasCompletedAssessment || state.assessmentInProgress || state.lastAssessment === null) {
        throw new CognitiveTransitionError(
          "COGNITIVE_DECISION requires completed assessment for active candidate",
          state.phase,
          event.type,
        );
      }
      if (!isValidDecision(decision)) {
        throw new CognitiveTransitionError(
          `Invalid decision: ${String(decision)}`,
          state.phase,
          event.type,
        );
      }

      switch (decision) {
        case "GO":
          return {
            ...state,
            lastDecision: decision,
            phase: "EXECUTING",
            executionAuthorized: false,
          };

        case "DELIBERATE":
          return {
            ...state,
            lastDecision: decision,
            phase: "AWAITING_SYSTEM2",
            pendingDeliberationCandidateId: cid,
            deliberationsUsed: state.deliberationsUsed + 1,
            executionAuthorized: false,
          };

        case "VERIFY":
          return {
            ...state,
            lastDecision: decision,
            phase: "AWAITING_VERIFICATION",
            pendingVerificationCandidateId: cid,
            verificationsUsed: state.verificationsUsed + 1,
            executionAuthorized: false,
          };

        case "BLOCK":
          return {
            ...state,
            lastDecision: decision,
            phase: "READY",
            blocks: state.blocks + 1,
            activeCandidateId: null,
            hasCompletedAssessment: false,
            assessmentInProgress: false,
            executionAuthorized: false,
          };

        default: {
          const _exhaustive: never = decision;
          throw new CognitiveTransitionError(
            `Unknown decision: ${String(_exhaustive)}`,
            state.phase,
            "unknown-decision",
          );
        }
      }
    }

    // ── ACTION_ALLOWED ───────────────────────────────────────────
    case "ACTION_ALLOWED": {
      requirePhase(state, "EXECUTING", event.type);
      requireCandidate(event, state.activeCandidateId, state);
      if (state.executionAuthorized) {
        throw new CognitiveTransitionError(
          "ACTION_ALLOWED already accepted for active candidate",
          state.phase,
          event.type,
        );
      }
      return { ...state, executionAuthorized: true };
    }

    // ── TOOL_COMPLETED ───────────────────────────────────────────
    case "TOOL_COMPLETED": {
      requirePhase(state, "EXECUTING", event.type);
      requireCandidate(event, state.activeCandidateId, state);
      if (!state.executionAuthorized) {
        throw new CognitiveTransitionError(
          "TOOL_COMPLETED requires ACTION_ALLOWED for active candidate",
          state.phase,
          event.type,
        );
      }
      return {
        ...state,
        phase: "READY",
        activeCandidateId: null,
        step: state.step + 1,
        actionsSinceLastDeliberation: state.actionsSinceLastDeliberation + 1,
        hasCompletedAssessment: false,
        assessmentInProgress: false,
        executionAuthorized: false,
      };
    }

    // ── DELIBERATION_REQUESTED ───────────────────────────────────
    case "DELIBERATION_REQUESTED": {
      requirePhase(state, "AWAITING_SYSTEM2", event.type);
      requireCandidate(event, state.activeCandidateId, state);
      return state;
    }

    // ── DELIBERATION_APPLIED ─────────────────────────────────────
    case "DELIBERATION_APPLIED": {
      requirePhase(state, "AWAITING_SYSTEM2", event.type);
      requireCandidate(event, state.activeCandidateId, state);
      return {
        ...state,
        phase: "AWAITING_STRATEGY_SHIFT",
        awaitingStrategyShift: true,
        actionsSinceLastDeliberation: 0,
        executionAuthorized: false,
      };
    }

    // ── STRATEGY_SHIFT_OBSERVED ──────────────────────────────────
    case "STRATEGY_SHIFT_OBSERVED": {
      requirePhase(state, "AWAITING_STRATEGY_SHIFT", event.type);
      requireCandidate(event, state.pendingDeliberationCandidateId, state);
      return {
        ...state,
        phase: "READY",
        awaitingStrategyShift: false,
        pendingDeliberationCandidateId: null,
        activeCandidateId: null,
        hasCompletedAssessment: false,
        assessmentInProgress: false,
        executionAuthorized: false,
      };
    }

    // ── VERIFICATION_REQUESTED ───────────────────────────────────
    case "VERIFICATION_REQUESTED": {
      requirePhase(state, "AWAITING_VERIFICATION", event.type);
      requireCandidate(event, state.pendingVerificationCandidateId, state);
      return state;
    }

    // ── VERIFICATION_COMPLETED ───────────────────────────────────
    case "VERIFICATION_COMPLETED": {
      requirePhase(state, "AWAITING_VERIFICATION", event.type);
      requireCandidate(event, state.pendingVerificationCandidateId, state);
      return {
        ...state,
        phase: "READY",
        pendingVerificationCandidateId: null,
        activeCandidateId: null,
        hasCompletedAssessment: false,
        assessmentInProgress: false,
        executionAuthorized: false,
      };
    }

    // ── ACTION_BLOCKED ───────────────────────────────────────────
    case "ACTION_BLOCKED": {
      throw new CognitiveTransitionError(
        `ACTION_BLOCKED is not a state-driving event; use COGNITIVE_DECISION BLOCK`,
        state.phase,
        event.type,
      );
    }

    // ── COGNITIVE_RUNTIME_DEGRADED ───────────────────────────────
    case "COGNITIVE_RUNTIME_DEGRADED": {
      if (TERMINAL_PHASES.has(phase)) {
        throw new CognitiveTransitionError(
          `Cannot degrade from ${phase}`,
          state.phase,
          event.type,
        );
      }
      if (typeof event.error !== "string" || event.error.trim().length === 0) {
        throw new CognitiveTransitionError(
          "COGNITIVE_RUNTIME_DEGRADED requires non-empty error reason",
          state.phase,
          event.type,
        );
      }
      return {
        ...state,
        phase: "DEGRADED",
        degradedReason: event.error,
      };
    }

    default: {
      const _exhaustive: never = event;
      throw new CognitiveTransitionError(
        `Unknown event type: ${String((_exhaustive as { type: string }).type)}`,
        state.phase,
        (_exhaustive as { type: string }).type,
      );
    }
  }
}

// ── Replay ───────────────────────────────────────────────────────────

export function replayCognitiveEvents(
  events: readonly CognitiveEvent[],
  initialState: CognitiveState = initialCognitiveState(),
): CognitiveState {
  let state = initialState;
  for (const event of events) {
    state = transitionCognitiveState(state, event);
  }
  return state;
}

// ── Apply with audit ─────────────────────────────────────────────────

export interface CognitiveTransitionResult {
  readonly previousState: CognitiveState;
  readonly event: CognitiveEvent;
  readonly nextState: CognitiveState;
}

export function applyCognitiveEvent(
  state: CognitiveState,
  event: CognitiveEvent,
): CognitiveTransitionResult {
  return {
    previousState: state,
    event,
    nextState: transitionCognitiveState(state, event),
  };
}
