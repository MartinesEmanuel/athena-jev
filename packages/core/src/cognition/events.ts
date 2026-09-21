import type { CognitiveAssessment } from "./assessment.js";
import type { CognitiveGateResult } from "./decision.js";

export type CognitiveEventType =
  | "CANDIDATE_PROPOSED"
  | "ASSESSMENT_STARTED"
  | "ASSESSMENT_COMPLETED"
  | "COGNITIVE_EVIDENCE_UPDATED"
  | "COGNITIVE_DECISION"
  | "DELIBERATION_REQUESTED"
  | "DELIBERATION_APPLIED"
  | "STRATEGY_SHIFT_OBSERVED"
  | "VERIFICATION_REQUESTED"
  | "VERIFICATION_COMPLETED"
  | "ACTION_ALLOWED"
  | "ACTION_BLOCKED"
  | "TOOL_COMPLETED"
  | "COGNITIVE_RUNTIME_DEGRADED";

export interface CognitiveEventBase {
  readonly timestamp: string;
  readonly sessionId: string;
  readonly type: CognitiveEventType;
}

export interface CandidateProposedEvent extends CognitiveEventBase {
  readonly type: "CANDIDATE_PROPOSED";
  readonly candidateId: string;
  readonly kind: string;
  readonly intent: string;
}

export interface AssessmentStartedEvent extends CognitiveEventBase {
  readonly type: "ASSESSMENT_STARTED";
  readonly candidateId: string;
}

export interface AssessmentCompletedEvent extends CognitiveEventBase {
  readonly type: "ASSESSMENT_COMPLETED";
  readonly candidateId: string;
  readonly assessment: CognitiveAssessment;
}

export interface CognitiveEvidenceUpdatedEvent extends CognitiveEventBase {
  readonly type: "COGNITIVE_EVIDENCE_UPDATED";
  readonly candidateId: string;
  readonly consecutiveLowProgress: number;
  readonly consecutiveLowInformationGain: number;
  readonly consecutiveHighStagnation: number;
}

export interface CognitiveDecisionEvent extends CognitiveEventBase {
  readonly type: "COGNITIVE_DECISION";
  readonly candidateId: string;
  readonly gateResult: CognitiveGateResult;
}

export interface DeliberationRequestedEvent extends CognitiveEventBase {
  readonly type: "DELIBERATION_REQUESTED";
  readonly candidateId: string;
  readonly reasons: readonly string[];
}

export interface DeliberationAppliedEvent extends CognitiveEventBase {
  readonly type: "DELIBERATION_APPLIED";
  readonly candidateId: string;
  readonly outcome: string;
}

export interface StrategyShiftObservedEvent extends CognitiveEventBase {
  readonly type: "STRATEGY_SHIFT_OBSERVED";
  readonly candidateId: string;
  readonly from: string;
  readonly to: string;
}

export interface VerificationRequestedEvent extends CognitiveEventBase {
  readonly type: "VERIFICATION_REQUESTED";
  readonly candidateId: string;
}

export interface VerificationCompletedEvent extends CognitiveEventBase {
  readonly type: "VERIFICATION_COMPLETED";
  readonly candidateId: string;
  readonly passed: boolean;
}

export interface ActionAllowedEvent extends CognitiveEventBase {
  readonly type: "ACTION_ALLOWED";
  readonly candidateId: string;
}

export interface ActionBlockedEvent extends CognitiveEventBase {
  readonly type: "ACTION_BLOCKED";
  readonly candidateId: string;
  readonly reasons: readonly string[];
}

export interface ToolCompletedEvent extends CognitiveEventBase {
  readonly type: "TOOL_COMPLETED";
  readonly candidateId: string;
}

export interface CognitiveRuntimeDegradedEvent extends CognitiveEventBase {
  readonly type: "COGNITIVE_RUNTIME_DEGRADED";
  readonly error: string;
}

export type CognitiveEvent =
  | CandidateProposedEvent
  | AssessmentStartedEvent
  | AssessmentCompletedEvent
  | CognitiveEvidenceUpdatedEvent
  | CognitiveDecisionEvent
  | DeliberationRequestedEvent
  | DeliberationAppliedEvent
  | StrategyShiftObservedEvent
  | VerificationRequestedEvent
  | VerificationCompletedEvent
  | ActionAllowedEvent
  | ActionBlockedEvent
  | ToolCompletedEvent
  | CognitiveRuntimeDegradedEvent;
