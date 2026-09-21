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
  type EpistemicAssessment,
  type EpistemicsAssessment,
  type CognitiveAssessment,
  assertCognitiveAssessment,
  isValidCognitiveAssessment,
} from "./assessment.js";

export {
  MAX_RECENT_COGNITIVE_ACTIONS,
  MAX_RECENT_STRATEGIES,
  MAX_COGNITIVE_OBLIGATIONS,
  MAX_COGNITIVE_COLLECTION_ENTRIES,
  MAX_COGNITIVE_TEXT_LENGTH,
  type ObservationOutcome,
  type ObligationStatus,
  type GoalState,
  type CurrentObservation,
  type ActionObservation,
  type StrategyFrame,
  type Obligation,
  type CognitiveEnvironmentState,
  type CognitiveWorldState,
  type CognitiveWorldStateInput,
  assertCognitiveWorldState,
  buildCognitiveWorldState,
} from "./world-state.js";

export {
  AEGIS_OBSERVER_VERSION,
  METIS_OBSERVER_VERSION,
  NIKE_OBSERVER_VERSION,
  EPISTEMIC_OBSERVER_VERSION,
  type ProbabilisticJudge,
  type CognitiveObserver,
  type AegisJudgmentInput,
  type MetisJudgmentInput,
  type NikeJudgmentInput,
  type EpistemicJudgmentInput,
  CognitiveObserverError,
  InvalidObserverAssessmentError,
  AegisObserver,
  MetisObserver,
  NikeObserver,
  EpistemicObserver,
} from "./observers.js";

export {
  SYSTEM1_SNAPSHOT_SCHEMA_VERSION,
  type System1Snapshot,
  assertSystem1Snapshot,
  CognitiveAssessmentEngine,
  createSystem1Snapshot,
} from "./system1.js";

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
