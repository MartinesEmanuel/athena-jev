import type { CognitiveAssessment } from "./assessment.js";

export type Decision = "GO" | "DELIBERATE" | "VERIFY" | "BLOCK";

export type ReasonCode =
  | "HARD_RULE"
  | "HIGH_IRREVERSIBLE_RISK"
  | "POLICY_VIOLATION"
  | "STAGNATION"
  | "LOW_INFORMATION_GAIN"
  | "LOW_GOAL_ALIGNMENT"
  | "HIGH_UNCERTAINTY"
  | "CONTRADICTORY_EVIDENCE"
  | "COMPLETION_NEEDS_EVIDENCE"
  | "COMPLETION_VERIFIED"
  | "HEALTHY_PROGRESS";

export const DECISIONS: readonly Decision[] = [
  "GO",
  "DELIBERATE",
  "VERIFY",
  "BLOCK",
] as const;

export const REASON_CODES: readonly ReasonCode[] = [
  "HARD_RULE",
  "HIGH_IRREVERSIBLE_RISK",
  "POLICY_VIOLATION",
  "STAGNATION",
  "LOW_INFORMATION_GAIN",
  "LOW_GOAL_ALIGNMENT",
  "HIGH_UNCERTAINTY",
  "CONTRADICTORY_EVIDENCE",
  "COMPLETION_NEEDS_EVIDENCE",
  "COMPLETION_VERIFIED",
  "HEALTHY_PROGRESS",
] as const;

export interface CognitiveGateResult {
  readonly decision: Decision;
  readonly assessment: CognitiveAssessment;
  readonly reasons: readonly ReasonCode[];
  readonly policyVersion: string;
}

export function isValidDecision(value: unknown): value is Decision {
  return DECISIONS.includes(value as Decision);
}

export function isValidReasonCode(value: unknown): value is ReasonCode {
  return REASON_CODES.includes(value as ReasonCode);
}
