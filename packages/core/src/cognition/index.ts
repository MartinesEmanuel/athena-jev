export {
  type Probability,
  isProbability,
  assertProbability,
} from "./validation.js";

export {
  type CandidateAction,
  type CandidateActionKind,
  isValidCandidateAction,
  assertCandidateAction,
} from "./candidate-action.js";

export {
  type SafetyAssessment,
  type ProgressAssessment,
  type CompletionAssessment,
  type EpistemicsAssessment,
  type CognitiveAssessment,
  assertCognitiveAssessment,
  isValidCognitiveAssessment,
} from "./assessment.js";

export {
  type Decision,
  type ReasonCode,
  type CognitiveGateResult,
  DECISIONS,
  REASON_CODES,
  isValidDecision,
  isValidReasonCode,
} from "./decision.js";

export {
  type CognitivePhase,
  COGNITIVE_PHASES,
  isValidCognitivePhase,
  type CognitiveState,
  initialCognitiveState,
  assertCognitiveStateInvariant,
  CognitiveTransitionError,
  CognitiveStateInvariantError,
  MAX_RECENT_COGNITIVE_ASSESSMENTS,
} from "./state.js";

export {
  type CognitiveEventType,
  type CognitiveEvent,
  type CandidateProposedEvent,
  type AssessmentStartedEvent,
  type AssessmentCompletedEvent,
  type CognitiveDecisionEvent,
  type DeliberationRequestedEvent,
  type DeliberationAppliedEvent,
  type StrategyShiftObservedEvent,
  type VerificationRequestedEvent,
  type VerificationCompletedEvent,
  type ActionAllowedEvent,
  type ActionBlockedEvent,
  type ToolCompletedEvent,
  type CognitiveRuntimeDegradedEvent,
} from "./events.js";

export {
  transitionCognitiveState,
  replayCognitiveEvents,
  applyCognitiveEvent,
  type CognitiveTransitionResult,
} from "./transition.js";

export const COGNITIVE_ASSESSMENT_SCHEMA_VERSION = "1" as const;
export const COGNITIVE_POLICY_VERSION = "0.2.0" as const;
