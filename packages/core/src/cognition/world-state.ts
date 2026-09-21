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

export interface GoalState {
  readonly goalId: string;
  readonly description: string;
  readonly acceptanceCriteria: readonly string[];
  readonly constraints: readonly string[];
}

export interface CurrentObservation {
  readonly source: string;
  readonly summary: string;
  readonly outcome: ObservationOutcome;
  readonly errorSummary?: string;
}

export interface ActionObservation {
  readonly candidateId: string;
  readonly kind: CandidateAction["kind"];
  readonly intent: string;
  readonly tool?: string;
  readonly outcome: ObservationOutcome;
  readonly informationSummary?: string;
  readonly errorSummary?: string;
}

export interface StrategyFrame {
  readonly strategyId: string;
  readonly intent: string;
  readonly approach: string;
  readonly hypothesisId?: string;
  readonly target?: string;
}

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
  readonly currentObservation?: CurrentObservation | null;
  readonly recentActions?: readonly ActionObservation[];
  readonly recentStrategies?: readonly StrategyFrame[];
  readonly unresolvedObligations?: readonly Obligation[];
  readonly environment?: Partial<CognitiveEnvironmentState>;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label}: expected object`);
  }
  return value as Record<string, unknown>;
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
  const item = record(value, "goal");
  return Object.freeze({ goalId: text(item.goalId, "goal.goalId")!, description: text(item.description, "goal.description")!, acceptanceCriteria: texts(item.acceptanceCriteria ?? [], "goal.acceptanceCriteria"), constraints: texts(item.constraints ?? [], "goal.constraints") });
}

function observation(value: unknown): CurrentObservation {
  const item = record(value, "currentObservation");
  const errorSummary = text(item.errorSummary, "currentObservation.errorSummary", true);
  return Object.freeze({ source: text(item.source, "currentObservation.source")!, summary: text(item.summary, "currentObservation.summary")!, outcome: outcome(item.outcome, "currentObservation.outcome"), ...(errorSummary === undefined ? {} : { errorSummary }) });
}

function action(value: unknown): ActionObservation {
  const item = record(value, "recentAction");
  const kind = item.kind;
  if (kind !== "tool" && kind !== "answer" && kind !== "complete") throw new TypeError("recentAction.kind: invalid candidate kind");
  const tool = text(item.tool, "recentAction.tool", true);
  const informationSummary = text(item.informationSummary, "recentAction.informationSummary", true);
  const errorSummary = text(item.errorSummary, "recentAction.errorSummary", true);
  return Object.freeze({ candidateId: text(item.candidateId, "recentAction.candidateId")!, kind, intent: text(item.intent, "recentAction.intent")!, outcome: outcome(item.outcome, "recentAction.outcome"), ...(tool === undefined ? {} : { tool }), ...(informationSummary === undefined ? {} : { informationSummary }), ...(errorSummary === undefined ? {} : { errorSummary }) });
}

function strategy(value: unknown): StrategyFrame {
  const item = record(value, "recentStrategy");
  const hypothesisId = text(item.hypothesisId, "recentStrategy.hypothesisId", true);
  const target = text(item.target, "recentStrategy.target", true);
  return Object.freeze({ strategyId: text(item.strategyId, "recentStrategy.strategyId")!, intent: text(item.intent, "recentStrategy.intent")!, approach: text(item.approach, "recentStrategy.approach")!, ...(hypothesisId === undefined ? {} : { hypothesisId }), ...(target === undefined ? {} : { target }) });
}

function obligation(value: unknown): Obligation {
  const item = record(value, "unresolvedObligation");
  if (item.status !== "OPEN" && item.status !== "SATISFIED" && item.status !== "UNKNOWN") throw new TypeError("unresolvedObligation.status: invalid status");
  return Object.freeze({ id: text(item.id, "unresolvedObligation.id")!, description: text(item.description, "unresolvedObligation.description")!, status: item.status });
}

function bounded<T>(value: unknown, label: string, limit: number, mapper: (item: unknown) => T): readonly T[] {
  if (!Array.isArray(value)) throw new TypeError(`${label}: expected array`);
  return Object.freeze(value.slice(-limit).map(mapper));
}

function environment(value: unknown): CognitiveEnvironmentState {
  const item = value === undefined ? {} : record(value, "environment");
  const workingMode = item.workingMode === undefined || item.workingMode === null ? null : text(item.workingMode, "environment.workingMode")!;
  return Object.freeze({ workingMode, availableCapabilities: texts(item.availableCapabilities ?? [], "environment.availableCapabilities"), relevantConstraints: texts(item.relevantConstraints ?? [], "environment.relevantConstraints") });
}

export function assertCognitiveWorldState(value: unknown): CognitiveWorldState {
  const item = record(value, "CognitiveWorldState");
  return Object.freeze({ goal: goal(item.goal), candidate: cloneCandidate(item.candidate), currentObservation: item.currentObservation === null || item.currentObservation === undefined ? null : observation(item.currentObservation), recentActions: bounded(item.recentActions ?? [], "recentActions", MAX_RECENT_COGNITIVE_ACTIONS, action), recentStrategies: bounded(item.recentStrategies ?? [], "recentStrategies", MAX_RECENT_STRATEGIES, strategy), unresolvedObligations: bounded(item.unresolvedObligations ?? [], "unresolvedObligations", MAX_COGNITIVE_OBLIGATIONS, obligation), environment: environment(item.environment) });
}

export function buildCognitiveWorldState(input: CognitiveWorldStateInput): CognitiveWorldState {
  return assertCognitiveWorldState(input);
}
