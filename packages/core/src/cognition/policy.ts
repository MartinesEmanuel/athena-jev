import type { CognitiveAssessment } from "./assessment.js";
import { assertCognitiveAssessment } from "./assessment.js";
import type { CognitiveGateResult, Decision, ReasonCode } from "./decision.js";
import { isValidReasonCode } from "./decision.js";
import type { CognitiveEvidenceUpdatedEvent, CognitiveDecisionEvent } from "./events.js";
import { assertCognitiveStateInvariant, type CognitiveState } from "./state.js";
import { assertCognitiveWorldState, type CognitiveWorldState } from "./world-state.js";

export const COGNITIVE_POLICY_VERSION = "0.3.0";

export interface CognitivePolicyConfig {
  readonly safety: { readonly policyViolation: number; readonly failure: number; readonly impact: number; readonly irreversibility: number; };
  readonly completion: { readonly goalSatisfied: number; readonly evidenceCoverage: number; readonly unresolvedObligations: number; };
  readonly epistemic: { readonly contradiction: number; readonly uncertainty: number; readonly sufficientContext: number; readonly insufficientContext: number; };
  readonly stagnation: { readonly high: number; readonly lowInformationGain: number; readonly lowStrategyNovelty: number; readonly emergencyHigh: number; };
  readonly goalDrift: { readonly lowAlignment: number; readonly lowInformationGain: number; };
  readonly temporal: { readonly lowProgress: number; readonly persistenceFrames: number; };
  readonly cooldown: { readonly actionsAfterDeliberation: number; };
}

/** Conservative defaults require multiple corroborating signals before intervention. */
export const DEFAULT_COGNITIVE_POLICY_CONFIG: CognitivePolicyConfig = Object.freeze({
  safety: Object.freeze({ policyViolation: 0.9, failure: 0.85, impact: 0.8, irreversibility: 0.8 }),
  completion: Object.freeze({ goalSatisfied: 0.8, evidenceCoverage: 0.75, unresolvedObligations: 0.35 }),
  epistemic: Object.freeze({ contradiction: 0.85, uncertainty: 0.8, sufficientContext: 0.65, insufficientContext: 0.25 }),
  stagnation: Object.freeze({ high: 0.75, lowInformationGain: 0.35, lowStrategyNovelty: 0.35, emergencyHigh: 0.95 }),
  goalDrift: Object.freeze({ lowAlignment: 0.25, lowInformationGain: 0.35 }),
  temporal: Object.freeze({ lowProgress: 0.35, persistenceFrames: 3 }),
  cooldown: Object.freeze({ actionsAfterDeliberation: 2 }),
});

export interface HardRuleAssessment { readonly allowed: boolean; readonly reasonCode: string | null; }
export interface TemporalEvidence { readonly consecutiveLowProgress: number; readonly consecutiveLowInformationGain: number; readonly consecutiveHighStagnation: number; }
export interface CognitivePolicyResult { readonly decision: Decision; readonly reasons: readonly ReasonCode[]; readonly policyVersion: typeof COGNITIVE_POLICY_VERSION; readonly triggeredRules: readonly string[]; readonly temporalEvidence: TemporalEvidence; }

function probability(value: unknown, label: string): number { if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) throw new TypeError(`${label}: expected finite probability`); return value; }
function thresholds(value: unknown, label: string, fields: readonly string[]): void { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(`${label}: expected object`); const section = value as Record<string, unknown>; if (Object.keys(section).some((key) => !fields.includes(key)) || fields.some((key) => !(key in section))) throw new TypeError(`${label}: unexpected or missing threshold`); for (const [key, threshold] of Object.entries(section)) probability(threshold, `${label}.${key}`); }

export function assertCognitivePolicyConfig(value: unknown): CognitivePolicyConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("CognitivePolicyConfig: expected object");
  const config = value as Record<string, unknown>;
  const sections = ["safety", "completion", "epistemic", "stagnation", "goalDrift", "temporal", "cooldown"];
  if (Object.keys(config).some((key) => !sections.includes(key)) || sections.some((key) => !(key in config))) throw new TypeError("CognitivePolicyConfig: unexpected or missing section");
  thresholds(config.safety, "safety", ["policyViolation", "failure", "impact", "irreversibility"]); thresholds(config.completion, "completion", ["goalSatisfied", "evidenceCoverage", "unresolvedObligations"]); thresholds(config.epistemic, "epistemic", ["contradiction", "uncertainty", "sufficientContext", "insufficientContext"]); thresholds(config.stagnation, "stagnation", ["high", "lowInformationGain", "lowStrategyNovelty", "emergencyHigh"]); thresholds(config.goalDrift, "goalDrift", ["lowAlignment", "lowInformationGain"]);
  const temporal = config.temporal as Record<string, unknown>;
  if (typeof temporal !== "object" || temporal === null || Object.keys(temporal).length !== 2) throw new TypeError("temporal: invalid section");
  probability(temporal.lowProgress, "temporal.lowProgress");
  if (!Number.isInteger(temporal.persistenceFrames) || (temporal.persistenceFrames as number) < 1) throw new TypeError("temporal.persistenceFrames: expected positive integer");
  const cooldown = config.cooldown as Record<string, unknown>;
  if (typeof cooldown !== "object" || cooldown === null || Object.keys(cooldown).length !== 1 || !Number.isInteger(cooldown.actionsAfterDeliberation) || (cooldown.actionsAfterDeliberation as number) < 1) throw new TypeError("cooldown.actionsAfterDeliberation: expected positive integer");
  return config as unknown as CognitivePolicyConfig;
}

function increment(current: number, condition: boolean): number { return condition ? current + 1 : 0; }
export function updateTemporalEvidence(state: CognitiveState, assessment: CognitiveAssessment, config: CognitivePolicyConfig = DEFAULT_COGNITIVE_POLICY_CONFIG): TemporalEvidence {
  assertCognitiveStateInvariant(state); const a = assertCognitiveAssessment(assessment); const c = assertCognitivePolicyConfig(config);
  return Object.freeze({ consecutiveLowProgress: increment(state.consecutiveLowProgress, a.progress.progressProbability <= c.temporal.lowProgress), consecutiveLowInformationGain: increment(state.consecutiveLowInformationGain, a.progress.informationGainProbability <= c.stagnation.lowInformationGain), consecutiveHighStagnation: increment(state.consecutiveHighStagnation, a.progress.stagnationProbability >= c.stagnation.high) });
}

function hardRule(value: HardRuleAssessment): HardRuleAssessment { if (typeof value !== "object" || value === null || typeof value.allowed !== "boolean" || (value.reasonCode !== null && (typeof value.reasonCode !== "string" || value.reasonCode.trim().length === 0))) throw new TypeError("HardRuleAssessment: invalid"); return value; }
function result(decision: Decision, reasons: readonly ReasonCode[], triggeredRules: readonly string[], temporalEvidence: TemporalEvidence): CognitivePolicyResult { if (reasons.length === 0 || reasons.some((reason) => !isValidReasonCode(reason))) throw new TypeError("CognitivePolicyResult: invalid reasons"); return Object.freeze({ decision, reasons: Object.freeze([...reasons]), policyVersion: COGNITIVE_POLICY_VERSION, triggeredRules: Object.freeze([...triggeredRules]), temporalEvidence }); }

export class CognitivePolicy {
  constructor(private readonly config: CognitivePolicyConfig = DEFAULT_COGNITIVE_POLICY_CONFIG) { assertCognitivePolicyConfig(config); }
  evaluate(assessment: CognitiveAssessment, state: CognitiveState, world: CognitiveWorldState, hard: HardRuleAssessment = { allowed: true, reasonCode: null }): CognitivePolicyResult {
    const a = assertCognitiveAssessment(assessment); assertCognitiveStateInvariant(state); assertCognitiveWorldState(world); const c = assertCognitivePolicyConfig(this.config); const rule = hardRule(hard); const temporal = updateTemporalEvidence(state, a, c);
    if (!rule.allowed) return result("BLOCK", ["HARD_RULE"], [rule.reasonCode ?? "hard-rule"], temporal);
    if (a.safety.policyViolationProbability >= c.safety.policyViolation) return result("BLOCK", ["POLICY_VIOLATION"], ["policy-violation"], temporal);
    if (a.safety.failureProbability >= c.safety.failure && a.safety.impactSeverity >= c.safety.impact && a.safety.irreversibility >= c.safety.irreversibility) return result("BLOCK", ["HIGH_IRREVERSIBLE_RISK"], ["irreversible-risk"], temporal);
    if (a.epistemics.contextSufficiency <= c.epistemic.insufficientContext) return result("GO", ["INSUFFICIENT_CONTEXT"], ["insufficient-context"], temporal);
    const completionPlausible = a.completion.goalSatisfiedProbability >= c.completion.goalSatisfied;
    if (completionPlausible && state.phase !== "AWAITING_VERIFICATION" && (a.completion.evidenceCoverage < c.completion.evidenceCoverage || a.completion.unresolvedObligationsProbability >= c.completion.unresolvedObligations)) return result("VERIFY", ["VERIFICATION_REQUIRED"], ["completion-evidence-gap"], temporal);
    const cooldown = state.awaitingStrategyShift || state.phase === "AWAITING_SYSTEM2" || (state.deliberationsUsed > 0 && state.actionsSinceLastDeliberation < c.cooldown.actionsAfterDeliberation);
    const persistentStagnation = temporal.consecutiveHighStagnation >= c.temporal.persistenceFrames && a.progress.informationGainProbability <= c.stagnation.lowInformationGain && a.progress.strategyNovelty <= c.stagnation.lowStrategyNovelty;
    const emergencyStagnation = a.progress.stagnationProbability >= c.stagnation.emergencyHigh && a.progress.informationGainProbability <= c.stagnation.lowInformationGain && a.progress.strategyNovelty <= c.stagnation.lowStrategyNovelty;
    const goalDrift = temporal.consecutiveLowInformationGain >= c.temporal.persistenceFrames && a.progress.goalAlignment <= c.goalDrift.lowAlignment && a.progress.informationGainProbability <= c.goalDrift.lowInformationGain;
    const epistemicConflict = a.epistemics.contextSufficiency >= c.epistemic.sufficientContext && (a.epistemics.contradictionProbability >= c.epistemic.contradiction || a.epistemics.stateUncertainty >= c.epistemic.uncertainty);
    if ((persistentStagnation || emergencyStagnation || goalDrift || epistemicConflict) && !cooldown) return result("DELIBERATE", [persistentStagnation || emergencyStagnation ? "PERSISTENT_STAGNATION" : goalDrift ? "GOAL_DRIFT" : a.epistemics.contradictionProbability >= c.epistemic.contradiction ? "CONTRADICTORY_EVIDENCE" : "HIGH_UNCERTAINTY"], [persistentStagnation ? "persistent-stagnation" : emergencyStagnation ? "emergency-stagnation" : goalDrift ? "goal-drift" : "epistemic-conflict"], temporal);
    if ((persistentStagnation || emergencyStagnation || goalDrift || epistemicConflict) && cooldown) return result("GO", ["DELIBERATION_COOLDOWN"], ["deliberation-cooldown"], temporal);
    if (a.progress.informationGainProbability >= c.stagnation.lowInformationGain && a.progress.progressProbability <= c.temporal.lowProgress) return result("GO", ["SAFE_INFORMATION_GATHERING"], ["information-gain"], temporal);
    return result("GO", ["HEALTHY_PROGRESS"], ["default"], temporal);
  }
}

export function policyResultToEvidenceEvent(result: CognitivePolicyResult, candidateId: string, timestamp: string, sessionId: string): CognitiveEvidenceUpdatedEvent { return { type: "COGNITIVE_EVIDENCE_UPDATED", candidateId, timestamp, sessionId, ...result.temporalEvidence }; }
export function policyResultToDecisionEvent(result: CognitivePolicyResult, assessment: CognitiveAssessment, candidateId: string, timestamp: string, sessionId: string): CognitiveDecisionEvent { const gateResult: CognitiveGateResult = { decision: result.decision, assessment: assertCognitiveAssessment(assessment), reasons: result.reasons, policyVersion: result.policyVersion }; return { type: "COGNITIVE_DECISION", candidateId, timestamp, sessionId, gateResult }; }
