import type { CognitiveAssessment } from "./assessment.js";
import { assertCognitiveAssessment } from "./assessment.js";
import type { CandidateAction } from "./candidate-action.js";
import { assertCandidateAction } from "./candidate-action.js";
import type { CognitivePolicyResult } from "./policy.js";
import type { DeliberationAppliedEvent, DeliberationRequestedEvent } from "./events.js";
import { assertCognitiveStateInvariant, type CognitiveState } from "./state.js";
import type { CognitiveWorldState, StrategyFrame } from "./world-state.js";
import { assertCognitiveWorldState } from "./world-state.js";

export const MAX_DELIBERATION_EVIDENCE = 6;
export const MAX_DELIBERATION_ACTIONS = 6;
export const MAX_DELIBERATION_TEXT_LENGTH = 800;
export const MAX_RENDERED_DELIBERATION_CONTEXT_LENGTH = 4000;

export type CognitiveFailureMode = "STAGNATION" | "GOAL_DRIFT" | "CONTRADICTION" | "INSUFFICIENT_PROGRESS" | "UNRESOLVED_COMPLETION" | "OTHER";
export interface RevisedStrategy { readonly strategyId: string; readonly intent: string; readonly approach: string; readonly hypothesisId?: string; readonly target?: string; readonly supersedesStrategyId?: string; readonly changeSummary?: string; }
export interface DeliberationRequest { readonly requestId: string; readonly candidateId: string; readonly goal: CognitiveWorldState["goal"]; readonly currentStrategy: StrategyFrame; readonly decisionReasons: readonly string[]; readonly relevantEvidence: readonly string[]; readonly constraints: readonly string[]; readonly failureMode: CognitiveFailureMode; readonly directive: string; readonly previousActions: readonly CognitiveWorldState["recentActions"][number][]; readonly unresolvedObligations: CognitiveWorldState["unresolvedObligations"]; readonly contradictions: readonly string[]; }
export interface PrivilegedCognitiveContext { readonly requestId: string; readonly candidateId: string; readonly text: string; }
export interface System2DeliberationResult { readonly requestId: string; readonly candidateId: string; readonly revisedStrategy: RevisedStrategy; readonly candidateAction?: CandidateAction; }
export interface System2Bridge { deliberate(request: DeliberationRequest): Promise<System2DeliberationResult>; }
export interface StrategyShiftAssessment { readonly strategyChanged: boolean; readonly intentChanged: boolean; readonly approachChanged: boolean; readonly hypothesisChanged: boolean; readonly changeMagnitude: number; readonly outcome: "SHIFT_OBSERVED" | "NO_MEANINGFUL_STRATEGY_SHIFT"; }
export interface DeliberationOrchestrationResult { readonly request: DeliberationRequest; readonly context: PrivilegedCognitiveContext; readonly result: System2DeliberationResult; readonly revisedStrategy: RevisedStrategy; readonly strategyShift: StrategyShiftAssessment; readonly events: readonly [DeliberationRequestedEvent, DeliberationAppliedEvent]; }

export class System2DeliberationError extends Error { constructor(message: string) { super(message); this.name = "System2DeliberationError"; } }
export class InvalidSystem2ResultError extends Error { constructor(message: string) { super(message); this.name = "InvalidSystem2ResultError"; } }
export class StaleDeliberationResultError extends Error { constructor(message: string) { super(message); this.name = "StaleDeliberationResultError"; } }

function object(value: unknown, label: string): Record<string, unknown> { if (typeof value !== "object" || value === null || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError(`${label}: expected object`); return value as Record<string, unknown>; }
function known(value: unknown, label: string, fields: readonly string[]): Record<string, unknown> { const item = object(value, label); if (Object.keys(item).some((key) => !fields.includes(key))) throw new TypeError(`${label}: unexpected field`); return item; }
function text(value: unknown, label: string, optional = false): string | undefined { if (value === undefined && optional) return undefined; if (typeof value !== "string" || value.trim().length === 0 || value.length > MAX_DELIBERATION_TEXT_LENGTH) throw new TypeError(`${label}: expected compact non-empty string`); return value; }
function texts(value: unknown, label: string, limit: number): readonly string[] { if (!Array.isArray(value) || value.length > limit) throw new TypeError(`${label}: invalid bounded array`); return Object.freeze(value.map((item, index) => text(item, `${label}[${index}]`)!)); }

export function assertRevisedStrategy(value: unknown): RevisedStrategy {
  const item = known(value, "RevisedStrategy", ["strategyId", "intent", "approach", "hypothesisId", "target", "supersedesStrategyId", "changeSummary"]);
  const optional = (key: string) => text(item[key], `RevisedStrategy.${key}`, true);
  return Object.freeze({ strategyId: text(item.strategyId, "RevisedStrategy.strategyId")!, intent: text(item.intent, "RevisedStrategy.intent")!, approach: text(item.approach, "RevisedStrategy.approach")!, ...(optional("hypothesisId") === undefined ? {} : { hypothesisId: optional("hypothesisId") }), ...(optional("target") === undefined ? {} : { target: optional("target") }), ...(optional("supersedesStrategyId") === undefined ? {} : { supersedesStrategyId: optional("supersedesStrategyId") }), ...(optional("changeSummary") === undefined ? {} : { changeSummary: optional("changeSummary") }) });
}

export function assertSystem2DeliberationResult(value: unknown): System2DeliberationResult {
  const item = known(value, "System2DeliberationResult", ["requestId", "candidateId", "revisedStrategy", "candidateAction"]);
  const candidateAction = item.candidateAction === undefined ? undefined : assertCandidateAction(item.candidateAction);
  return Object.freeze({ requestId: text(item.requestId, "System2DeliberationResult.requestId")!, candidateId: text(item.candidateId, "System2DeliberationResult.candidateId")!, revisedStrategy: assertRevisedStrategy(item.revisedStrategy), ...(candidateAction === undefined ? {} : { candidateAction: Object.freeze({ ...candidateAction }) }) });
}

function failureMode(reasons: readonly string[]): CognitiveFailureMode { if (reasons.includes("PERSISTENT_STAGNATION")) return "STAGNATION"; if (reasons.includes("GOAL_DRIFT")) return "GOAL_DRIFT"; if (reasons.includes("CONTRADICTORY_EVIDENCE")) return "CONTRADICTION"; if (reasons.includes("HIGH_UNCERTAINTY")) return "INSUFFICIENT_PROGRESS"; if (reasons.includes("VERIFICATION_REQUIRED")) return "UNRESOLVED_COMPLETION"; return "OTHER"; }
function directive(mode: CognitiveFailureMode): string { return ({ STAGNATION: "Reconsider the underlying hypothesis before another action.", GOAL_DRIFT: "Re-anchor the next action to the explicit goal.", CONTRADICTION: "Resolve the conflicting evidence before continuing.", INSUFFICIENT_PROGRESS: "Identify a more informative approach before continuing.", UNRESOLVED_COMPLETION: "Address unresolved completion evidence before continuing.", OTHER: "Propose a materially different strategy before another action." })[mode]; }
function currentStrategy(world: CognitiveWorldState): StrategyFrame { return world.recentStrategies.at(-1) ?? Object.freeze({ strategyId: `candidate-${world.candidate.id}`, intent: world.candidate.intent, approach: world.candidate.tool ?? world.candidate.kind, ...(world.candidate.hypothesisId === undefined ? {} : { hypothesisId: world.candidate.hypothesisId }) }); }
function evidence(assessment: CognitiveAssessment): readonly string[] { return Object.freeze([`progress=${assessment.progress.progressProbability}`, `informationGain=${assessment.progress.informationGainProbability}`, `strategyNovelty=${assessment.progress.strategyNovelty}`, `stagnation=${assessment.progress.stagnationProbability}`, `goalAlignment=${assessment.progress.goalAlignment}`, `contradiction=${assessment.epistemics.contradictionProbability}`]); }

export function buildDeliberationRequest(requestId: string, policy: CognitivePolicyResult, world: CognitiveWorldState, assessment: CognitiveAssessment): DeliberationRequest {
  const state = assertCognitiveWorldState(world); const judged = assertCognitiveAssessment(assessment); if (policy.decision !== "DELIBERATE") throw new System2DeliberationError("Deliberation requires DELIBERATE policy result");
  const mode = failureMode(policy.reasons); return Object.freeze({ requestId: text(requestId, "requestId")!, candidateId: state.candidate.id, goal: Object.freeze({ ...state.goal, acceptanceCriteria: Object.freeze([...(state.goal.acceptanceCriteria ?? [])]), constraints: Object.freeze([...(state.goal.constraints ?? [])]) }), currentStrategy: Object.freeze({ ...currentStrategy(state) }), decisionReasons: texts(policy.reasons, "decisionReasons", MAX_DELIBERATION_EVIDENCE), relevantEvidence: evidence(judged), constraints: Object.freeze([...(state.goal.constraints ?? []), ...state.environment.relevantConstraints].slice(0, MAX_DELIBERATION_EVIDENCE)), failureMode: mode, directive: directive(mode), previousActions: Object.freeze(state.recentActions.slice(-MAX_DELIBERATION_ACTIONS).map((action) => Object.freeze({ ...action }))), unresolvedObligations: Object.freeze(state.unresolvedObligations.map((item) => Object.freeze({ ...item }))), contradictions: judged.epistemics.contradictionProbability > 0 ? Object.freeze([`contradiction=${judged.epistemics.contradictionProbability}`]) : Object.freeze([]) });
}

export function renderDeliberationContext(request: DeliberationRequest): PrivilegedCognitiveContext {
  const text = ["ATHENA COGNITIVE INTERVENTION", "", `Goal: ${request.goal.description}`, `Detected issue: ${request.failureMode}`, `Reasons: ${request.decisionReasons.join(", ")}`, `Evidence: ${request.relevantEvidence.map((item) => `- ${item}`).join("\n")}`, `Current strategy: ${request.currentStrategy.intent}; ${request.currentStrategy.approach}`, `Directive: ${request.directive}`, `Constraints: ${request.constraints.join("; ") || "none"}`, "Return: revised intent, revised approach, optional hypothesis, optional next candidate action."].join("\n");
  if (text.length > MAX_RENDERED_DELIBERATION_CONTEXT_LENGTH) throw new TypeError("PrivilegedCognitiveContext: rendered text exceeds bound");
  return Object.freeze({ requestId: request.requestId, candidateId: request.candidateId, text });
}

export function assessStrategyShift(previous: StrategyFrame, revised: RevisedStrategy): StrategyShiftAssessment {
  const intentChanged = previous.intent !== revised.intent; const approachChanged = previous.approach !== revised.approach; const hypothesisChanged = (previous.hypothesisId ?? null) !== (revised.hypothesisId ?? null); const targetChanged = (previous.target ?? null) !== (revised.target ?? null); const changeMagnitude = [intentChanged, approachChanged, hypothesisChanged, targetChanged].filter(Boolean).length; const strategyChanged = approachChanged && (hypothesisChanged || targetChanged || revised.supersedesStrategyId === previous.strategyId);
  return Object.freeze({ strategyChanged, intentChanged, approachChanged, hypothesisChanged, changeMagnitude, outcome: strategyChanged ? "SHIFT_OBSERVED" : "NO_MEANINGFUL_STRATEGY_SHIFT" });
}

function lifecycleCurrent(state: CognitiveState, candidateId: string): boolean { return state.phase === "AWAITING_SYSTEM2" && state.activeCandidateId === candidateId && state.pendingDeliberationCandidateId === candidateId; }

export class System2DeliberationOrchestrator {
  private readonly consumed = new Set<string>();
  constructor(private readonly bridge: System2Bridge) {}
  async deliberate(input: { readonly requestId: string; readonly policy: CognitivePolicyResult; readonly world: CognitiveWorldState; readonly assessment: CognitiveAssessment; readonly state: CognitiveState; readonly sessionId: string; readonly timestamp: string; readonly currentState: () => CognitiveState; }): Promise<DeliberationOrchestrationResult> {
    if (input.policy.decision !== "DELIBERATE") throw new System2DeliberationError("System 2 is only available for DELIBERATE");
    assertCognitiveStateInvariant(input.state); if (!lifecycleCurrent(input.state, input.world.candidate.id)) throw new StaleDeliberationResultError("Deliberation lifecycle is not active for candidate");
    if (this.consumed.has(input.requestId)) throw new StaleDeliberationResultError("Deliberation request already consumed");
    const request = buildDeliberationRequest(input.requestId, input.policy, input.world, input.assessment); const context = renderDeliberationContext(request);
    const requested: DeliberationRequestedEvent = { type: "DELIBERATION_REQUESTED", candidateId: request.candidateId, reasons: Object.freeze([...request.decisionReasons]), timestamp: input.timestamp, sessionId: input.sessionId };
    let returned: unknown; try { returned = await this.bridge.deliberate(request); } catch { throw new System2DeliberationError("System 2 deliberation failed"); }
    const result = assertSystem2DeliberationResult(returned); if (result.requestId !== request.requestId || result.candidateId !== request.candidateId) throw new InvalidSystem2ResultError("System 2 result violates request causality"); if (!lifecycleCurrent(input.currentState(), request.candidateId)) throw new StaleDeliberationResultError("System 2 result is stale"); if (this.consumed.has(request.requestId)) throw new StaleDeliberationResultError("System 2 result is duplicate"); this.consumed.add(request.requestId);
    const shift = assessStrategyShift(request.currentStrategy, result.revisedStrategy); const applied: DeliberationAppliedEvent = { type: "DELIBERATION_APPLIED", candidateId: request.candidateId, outcome: shift.outcome, timestamp: input.timestamp, sessionId: input.sessionId };
    return Object.freeze({ request, context, result, revisedStrategy: result.revisedStrategy, strategyShift: shift, events: Object.freeze([requested, applied]) as DeliberationOrchestrationResult["events"] });
  }
}
