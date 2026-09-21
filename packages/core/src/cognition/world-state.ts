import type { CandidateAction } from "./candidate-action.js";
import { assertCandidateAction } from "./candidate-action.js";

// Twelve actions capture a short tool loop without retaining a host trace.
export const MAX_RECENT_COGNITIVE_ACTIONS = 12;
// Six frames retain alternate approaches while making strategy repetition visible.
export const MAX_RECENT_STRATEGIES = 6;
// Twelve obligations cover common acceptance and verification work without unbounded task state.
export const MAX_COGNITIVE_OBLIGATIONS = 12;
export const MAX_COGNITIVE_COLLECTION_ENTRIES = 12;
export const MAX_COGNITIVE_TEXT_LENGTH = 1000;

export type ObservationOutcome = "SUCCESS" | "FAILURE" | "UNKNOWN";
export type ObligationStatus = "OPEN" | "SATISFIED" | "UNKNOWN";
export type EvidenceSource = "USER" | "TOOL" | "SYSTEM2" | "ATHENA" | "DETERMINISTIC";
export type EpistemicStatus = "OBSERVED" | "PROPOSED" | "INFERRED";
export type EvidenceTrust = "TRUSTED" | "UNTRUSTED";

export interface EvidenceProvenance {
  readonly source: EvidenceSource;
  readonly epistemicStatus: EpistemicStatus;
  readonly trust: EvidenceTrust;
}

export interface GoalState {
  readonly goalId: string;
  readonly description: string;
  readonly acceptanceCriteria?: readonly string[];
  readonly constraints?: readonly string[];
}

export interface CurrentObservation {
  readonly source: string;
  readonly summary: string;
  readonly outcome: ObservationOutcome;
  readonly errorSummary?: string;
  readonly provenance: EvidenceProvenance;
}

export interface ActionObservation {
  readonly candidateId: string;
  readonly kind: CandidateAction["kind"];
  readonly intent: string;
  readonly tool?: string;
  readonly outcome: ObservationOutcome;
  readonly informationSummary?: string;
  readonly errorSummary?: string;
  readonly provenance: EvidenceProvenance;
}

export interface StrategyFrame {
  readonly strategyId: string;
  readonly intent: string;
  readonly approach: string;
  readonly hypothesisId?: string;
  readonly target?: string;
  // Optional type preserves callers that construct strategy frames outside world-state input.
  readonly provenance?: EvidenceProvenance;
}

export type CurrentObservationInput = Omit<CurrentObservation, "provenance"> & { readonly provenance?: EvidenceProvenance };
export type ActionObservationInput = Omit<ActionObservation, "provenance"> & { readonly provenance?: EvidenceProvenance };
export type StrategyFrameInput = Omit<StrategyFrame, "provenance"> & { readonly provenance?: EvidenceProvenance };

export interface Obligation {
  readonly id: string;
  readonly description: string;
  readonly status: ObligationStatus;
}

export interface CognitiveEnvironmentState {
  readonly workingMode: string | null;
  readonly availableCapabilities: readonly string[];
  readonly relevantConstraints: readonly string[];
}

export interface CognitiveWorldState {
  readonly goal: GoalState;
  readonly candidate: CandidateAction;
  readonly currentObservation: CurrentObservation | null;
  readonly recentActions: readonly ActionObservation[];
  readonly recentStrategies: readonly StrategyFrame[];
  readonly unresolvedObligations: readonly Obligation[];
  readonly environment: CognitiveEnvironmentState;
}

export interface CognitiveWorldStateInput {
  readonly goal: GoalState;
  readonly candidate: CandidateAction;
  readonly currentObservation?: CurrentObservationInput | null;
  readonly recentActions?: readonly ActionObservationInput[];
  readonly recentStrategies?: readonly StrategyFrameInput[];
  readonly unresolvedObligations?: readonly Obligation[];
  readonly environment?: Partial<CognitiveEnvironmentState>;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new TypeError(`${label}: expected object`);
  }
  return value as Record<string, unknown>;
}

function exact(value: unknown, label: string, fields: readonly string[]): Record<string, unknown> {
  const item = record(value, label);
  if (Object.keys(item).some((key) => !fields.includes(key))) throw new TypeError(`${label}: unexpected field`);
  return item;
}

function optional(item: Record<string, unknown>, key: string): unknown {
  if (!(key in item)) return undefined;
  if (item[key] === undefined) throw new TypeError(`${key}: must be omitted instead of undefined`);
  return item[key];
}

function text(value: unknown, label: string, optional = false): string | undefined {
  if (value === undefined && optional) return undefined;
  if (typeof value !== "string" || value.trim().length === 0 || value.length > MAX_COGNITIVE_TEXT_LENGTH) {
    throw new TypeError(`${label}: expected non-empty string up to ${MAX_COGNITIVE_TEXT_LENGTH} characters`);
  }
  return value;
}

function texts(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new TypeError(`${label}: expected array`);
  return Object.freeze(value.slice(0, MAX_COGNITIVE_COLLECTION_ENTRIES).map((item, index) => text(item, `${label}[${index}]`)!));
}

function outcome(value: unknown, label: string): ObservationOutcome {
  if (value === "SUCCESS" || value === "FAILURE" || value === "UNKNOWN") return value;
  throw new TypeError(`${label}: expected SUCCESS, FAILURE, or UNKNOWN`);
}

function provenance(value: unknown, label: string, defaults: EvidenceProvenance): EvidenceProvenance {
  if (value === undefined) return Object.freeze({ ...defaults });
  const item = exact(value, label, ["source", "epistemicStatus", "trust"]);
  if (item.source !== "USER" && item.source !== "TOOL" && item.source !== "SYSTEM2" && item.source !== "ATHENA" && item.source !== "DETERMINISTIC") {
    throw new TypeError(`${label}.source: invalid evidence source`);
  }
  if (item.epistemicStatus !== "OBSERVED" && item.epistemicStatus !== "PROPOSED" && item.epistemicStatus !== "INFERRED") {
    throw new TypeError(`${label}.epistemicStatus: invalid epistemic status`);
  }
  if (item.trust !== "TRUSTED" && item.trust !== "UNTRUSTED") throw new TypeError(`${label}.trust: invalid evidence trust`);
  return Object.freeze({ source: item.source, epistemicStatus: item.epistemicStatus, trust: item.trust });
}

function cloneCandidate(value: unknown): CandidateAction {
  const candidate = assertCandidateAction(value);
  text(candidate.id, "candidate.id");
  text(candidate.intent, "candidate.intent");
  if (candidate.tool !== undefined) text(candidate.tool, "candidate.tool");
  if (candidate.input !== undefined) text(candidate.input, "candidate.input");
  if (candidate.expectedObservation !== undefined) text(candidate.expectedObservation, "candidate.expectedObservation");
  if (candidate.hypothesisId !== undefined) text(candidate.hypothesisId, "candidate.hypothesisId");
  return Object.freeze({ id: candidate.id, kind: candidate.kind, intent: candidate.intent, ...(candidate.tool === undefined ? {} : { tool: candidate.tool }), ...(candidate.input === undefined ? {} : { input: candidate.input }), ...(candidate.expectedObservation === undefined ? {} : { expectedObservation: candidate.expectedObservation }), ...(candidate.hypothesisId === undefined ? {} : { hypothesisId: candidate.hypothesisId }) });
}

function goal(value: unknown): GoalState {
  const item = exact(value, "goal", ["goalId", "description", "acceptanceCriteria", "constraints"]);
  const acceptanceCriteria = optional(item, "acceptanceCriteria");
  const constraints = optional(item, "constraints");
  return Object.freeze({ goalId: text(item.goalId, "goal.goalId")!, description: text(item.description, "goal.description")!, acceptanceCriteria: texts(acceptanceCriteria === undefined ? [] : acceptanceCriteria, "goal.acceptanceCriteria"), constraints: texts(constraints === undefined ? [] : constraints, "goal.constraints") });
}

function observation(value: unknown): CurrentObservation {
  const item = exact(value, "currentObservation", ["source", "summary", "outcome", "errorSummary", "provenance"]);
  const errorSummary = text(optional(item, "errorSummary"), "currentObservation.errorSummary", true);
  return Object.freeze({ source: text(item.source, "currentObservation.source")!, summary: text(item.summary, "currentObservation.summary")!, outcome: outcome(item.outcome, "currentObservation.outcome"), ...(errorSummary === undefined ? {} : { errorSummary }), provenance: provenance(optional(item, "provenance"), "currentObservation.provenance", { source: "TOOL", epistemicStatus: "OBSERVED", trust: "UNTRUSTED" }) });
}

function action(value: unknown): ActionObservation {
  const item = exact(value, "recentAction", ["candidateId", "kind", "intent", "tool", "outcome", "informationSummary", "errorSummary", "provenance"]);
  const kind = item.kind;
  if (kind !== "tool" && kind !== "answer" && kind !== "complete") throw new TypeError("recentAction.kind: invalid candidate kind");
  const tool = text(optional(item, "tool"), "recentAction.tool", true);
  const informationSummary = text(optional(item, "informationSummary"), "recentAction.informationSummary", true);
  const errorSummary = text(optional(item, "errorSummary"), "recentAction.errorSummary", true);
  return Object.freeze({ candidateId: text(item.candidateId, "recentAction.candidateId")!, kind, intent: text(item.intent, "recentAction.intent")!, outcome: outcome(item.outcome, "recentAction.outcome"), ...(tool === undefined ? {} : { tool }), ...(informationSummary === undefined ? {} : { informationSummary }), ...(errorSummary === undefined ? {} : { errorSummary }), provenance: provenance(optional(item, "provenance"), "recentAction.provenance", { source: "TOOL", epistemicStatus: "OBSERVED", trust: "UNTRUSTED" }) });
}

function strategy(value: unknown): StrategyFrame {
  const item = exact(value, "recentStrategy", ["strategyId", "intent", "approach", "hypothesisId", "target", "provenance"]);
  const hypothesisId = text(optional(item, "hypothesisId"), "recentStrategy.hypothesisId", true);
  const target = text(optional(item, "target"), "recentStrategy.target", true);
  return Object.freeze({ strategyId: text(item.strategyId, "recentStrategy.strategyId")!, intent: text(item.intent, "recentStrategy.intent")!, approach: text(item.approach, "recentStrategy.approach")!, ...(hypothesisId === undefined ? {} : { hypothesisId }), ...(target === undefined ? {} : { target }), provenance: provenance(optional(item, "provenance"), "recentStrategy.provenance", { source: "ATHENA", epistemicStatus: "PROPOSED", trust: "UNTRUSTED" }) });
}

function obligation(value: unknown): Obligation {
  const item = exact(value, "unresolvedObligation", ["id", "description", "status"]);
  if (item.status !== "OPEN" && item.status !== "SATISFIED" && item.status !== "UNKNOWN") throw new TypeError("unresolvedObligation.status: invalid status");
  return Object.freeze({ id: text(item.id, "unresolvedObligation.id")!, description: text(item.description, "unresolvedObligation.description")!, status: item.status });
}

function bounded<T>(value: unknown, label: string, limit: number, mapper: (item: unknown) => T): readonly T[] {
  if (!Array.isArray(value)) throw new TypeError(`${label}: expected array`);
  return Object.freeze(value.slice(-limit).map(mapper));
}

function environment(value: unknown): CognitiveEnvironmentState {
  const item = value === undefined ? {} : exact(value, "environment", ["workingMode", "availableCapabilities", "relevantConstraints"]);
  const workingModeValue = optional(item, "workingMode");
  const workingMode = workingModeValue === undefined || workingModeValue === null ? null : text(workingModeValue, "environment.workingMode")!;
  const availableCapabilities = optional(item, "availableCapabilities");
  const relevantConstraints = optional(item, "relevantConstraints");
  return Object.freeze({ workingMode, availableCapabilities: texts(availableCapabilities === undefined ? [] : availableCapabilities, "environment.availableCapabilities"), relevantConstraints: texts(relevantConstraints === undefined ? [] : relevantConstraints, "environment.relevantConstraints") });
}

export function assertCognitiveWorldState(value: unknown): CognitiveWorldState {
  const item = exact(value, "CognitiveWorldState", ["goal", "candidate", "currentObservation", "recentActions", "recentStrategies", "unresolvedObligations", "environment"]);
  const currentObservation = optional(item, "currentObservation");
  const recentActions = optional(item, "recentActions");
  const recentStrategies = optional(item, "recentStrategies");
  const unresolvedObligations = optional(item, "unresolvedObligations");
  return Object.freeze({ goal: goal(item.goal), candidate: cloneCandidate(item.candidate), currentObservation: currentObservation === undefined || currentObservation === null ? null : observation(currentObservation), recentActions: bounded(recentActions === undefined ? [] : recentActions, "recentActions", MAX_RECENT_COGNITIVE_ACTIONS, action), recentStrategies: bounded(recentStrategies === undefined ? [] : recentStrategies, "recentStrategies", MAX_RECENT_STRATEGIES, strategy), unresolvedObligations: bounded(unresolvedObligations === undefined ? [] : unresolvedObligations, "unresolvedObligations", MAX_COGNITIVE_OBLIGATIONS, obligation), environment: environment(optional(item, "environment")) });
}

export function buildCognitiveWorldState(input: CognitiveWorldStateInput): CognitiveWorldState {
  return assertCognitiveWorldState(input);
}
