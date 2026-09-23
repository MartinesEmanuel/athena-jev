import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";

export {
  type CognitiveAssessment,
  type SafetyAssessment,
  type ProgressAssessment,
  type CompletionAssessment,
  type EpistemicAssessment,
  type CognitiveWorldState,
  type EvidenceSource,
  type EpistemicStatus,
  type EvidenceTrust,
  type EvidenceProvenance,
  type CurrentObservation,
  type ActionObservation,
  type StrategyFrame,
  type ProbabilisticJudge,
  type AegisJudgmentInput,
  type MetisJudgmentInput,
  type NikeJudgmentInput,
  type EpistemicJudgmentInput,
  AegisObserver,
  MetisObserver,
  NikeObserver,
  EpistemicObserver,
  CognitiveAssessmentEngine,
  type System1Snapshot,
  CognitiveObserverError,
  CognitivePolicy,
  buildCognitiveWorldState,
  initialCognitiveState,
  type CognitiveState,
  System2DeliberationOrchestrator,
  policyResultToEvidenceEvent,
  policyResultToDecisionEvent,
  transitionCognitiveState,
  type System2Bridge,
  type DeliberationRequest,
  type System2DeliberationResult,
  type CognitivePolicyResult,
  System2DeliberationError,
  assertSystem2DeliberationResult,
  renderDeliberationContext,
  buildDeliberationRequest,
  assessStrategyShift,
} from "./cognition/index.js";
export * from "./tool-routing/index.js";

export type AthenaDecision = "allow" | "ask" | "deny" | "replan";
export type AthenaMode = "shadow" | "guardian" | "balanced";
export type ReflexKind = "risk" | "progress" | "stagnation" | "completion";
export type Probability = number;
export interface Action { id: string; tool: string; input: string; readOnly?: boolean; timestamp: string }
export interface ToolResult { actionId: string; success: boolean; output: string; changedFiles?: string[]; timestamp: string }
export interface Session { id: string; goal: string; actions: Action[]; results: ToolResult[]; replans: number; meaningfulActions: number; jevCalls: number; lastReplanAt?: number; lastReplanMeaningfulAction?: number }
export type ReplanState = "detected" | "queued" | "injected" | "observing" | "resolved";
export type ReplanOutcome = "changed" | "ignored" | "unclear";
export interface PendingReplan { id: string; sessionID: string; createdAt: number; stagnationScore: number; evidence: StagnationReflex; consumed: boolean; state: ReplanState; outcome?: ReplanOutcome; instructionHash?: string }
export interface RiskReflex { relevance: Probability; unintendedChange: Probability; broadness: Probability; approvalNeeded: Probability }
export interface ProgressReflex { usefulInformation: Probability; advancedGoal: Probability; strategyInvalidated: Probability; continueApproach: Probability }
export interface StagnationReflex { sameStrategy: Probability; sameUnderlyingProblem: Probability; surfaceVariation: Probability; newInformation: Probability; likelyToProgress: Probability; strategyChangeNeeded: Probability }
export interface CompletionReflex { requirementsSatisfied: Probability; evidenceWorks: Probability; unresolvedFailures: Probability; testingSufficient: Probability; shouldContinue: Probability }
export interface ReflexProvider { name: "typesafe" | "demo"; evaluateRisk(state: ReflexState): Promise<RiskReflex>; evaluateProgress(state: ReflexState): Promise<ProgressReflex>; evaluateStagnation(state: ReflexState): Promise<StagnationReflex>; evaluateCompletion(state: ReflexState): Promise<CompletionReflex> }
export interface ReflexState { goal: string; proposedAction?: { tool: string; intent: string; category: string }; action?: Action; result?: { success: boolean; summary: string; errors: string[] }; recentActions: Array<{ tool: string; intent: string; category: string; strategy: string; success?: boolean; resultSummary?: string; errorFamily?: string }>; changedFiles: string[]; currentErrors: string[]; repeatedErrors: string[]; buildStatus: "passed" | "failed" | "unknown"; testStatus: "passed" | "failed" | "unknown" }
export const configSchema = z.object({
  mode: z.enum(["shadow", "guardian", "balanced"]).default("shadow"), provider: z.enum(["typesafe", "demo"]).default("typesafe"),
  reflexes: z.object({ risk: z.boolean().default(true), progress: z.boolean().default(true), stagnation: z.boolean().default(true), completion: z.boolean().default(true) }).default({}),
  thresholds: z.object({ riskAsk: z.number().min(0).max(1).default(0.8), riskDeny: z.number().min(0).max(1).default(0.95), stagnation: z.number().min(0).max(1).default(0.75), replan: z.number().min(0).max(1).default(0.9), completionContinue: z.number().min(0).max(1).default(0.85) }).default({}),
  telemetry: z.object({ persist: z.boolean().default(true) }).default({}),
  toolRouter: z.object({ mode: z.enum(["off", "observe", "active"]).default("observe") }).default({}),
  budgets: z.object({ maxJevCallsPerSession: z.number().int().min(1).max(1000).default(100), minMeaningfulActionsBetweenStagnationChecks: z.number().int().min(1).max(20).default(2), replanCooldownMeaningfulActions: z.number().int().min(1).max(50).default(3) }).default({})
});
export type AthenaConfig = z.infer<typeof configSchema>;
export const defaultConfig: AthenaConfig = configSchema.parse({});
export function redact(value: string): string { return value.replace(/(sk-[\w-]{12,}|AKIA[\w]{16}|(?:api[_-]?key|password|token|secret)\s*[=:]\s*)[^\s"']+/gi, "$1[REDACTED]").replace(/Bearer\s+[\w.-]+/gi, "Bearer [REDACTED]"); }
export interface HardRuleMatch { id: string; category: "filesystem" | "git" | "database" | "privilege" | "secrets"; reason: string; evidence: string }
export function hardRule(action: Action): HardRuleMatch | undefined {
  const text = action.input.toLowerCase();
  if (/\brm\s+(-\w*[rf]\w*\s+)*\/?(\s|$)/.test(text) || /\brm\s+-rf\s+(\/|~|\$home|\/home|\/usr|\/etc)(\s|$)/.test(text)) return { id: "FS_ROOT_RECURSIVE_DELETE", category: "filesystem", reason: "catastrophic filesystem deletion", evidence: action.input.slice(0, 160) };
  if (/\bgit\s+(reset\s+--hard|clean\s+-[fd]|push\s+.*--force)/.test(text)) return { id: "GIT_DESTRUCTIVE", category: "git", reason: "destructive Git command", evidence: action.input.slice(0, 160) };
  if (/\b(drop\s+(database|table)|truncate\s+table|delete\s+from\s+\w+\s*;)/.test(text)) return { id: "DB_DESTRUCTIVE", category: "database", reason: "destructive database command", evidence: action.input.slice(0, 160) };
  if (/\b(sudo|doas)\b/.test(text) && !/\b(apt|dnf|brew)\s+(install|update)/.test(text)) return { id: "PRIVILEGE_ESCALATION", category: "privilege", reason: "unjustified privilege escalation", evidence: action.input.slice(0, 160) };
  if (action.tool === "read" && /(^|\/)\.env([./]|$)/.test(text)) return { id: "SECRET_ENV_READ", category: "secrets", reason: "environment file access", evidence: action.input.slice(0, 160) };
  return undefined;
}
export interface PolicyResult { decision: AthenaDecision; reason: string; shadow: boolean }
export function stagnationScore(value: StagnationReflex): number { return 0.25 * value.sameStrategy + 0.2 * value.sameUnderlyingProblem + 0.15 * value.surfaceVariation + 0.2 * (1 - value.newInformation) + 0.1 * (1 - value.likelyToProgress) + 0.1 * value.strategyChangeNeeded; }
export function hasStagnationEvidence(value: StagnationReflex): boolean { return [value.sameStrategy >= 0.7, value.sameUnderlyingProblem >= 0.7, value.surfaceVariation >= 0.6, value.newInformation <= 0.4, value.likelyToProgress <= 0.4, value.strategyChangeNeeded >= 0.6].filter(Boolean).length >= 4; }
export function decide(config: AthenaConfig, input: { action: Action; risk?: RiskReflex; stagnation?: StagnationReflex; completion?: CompletionReflex }): PolicyResult {
  const hard = hardRule(input.action); let decision: AthenaDecision = "allow"; let reason = "within configured policy";
  if (hard) { decision = "deny"; reason = `${hard.id}: ${hard.reason}`; }
  else if (input.stagnation && stagnationScore(input.stagnation) >= config.thresholds.stagnation && input.stagnation.newInformation <= 0.45 && hasStagnationEvidence(input.stagnation)) { decision = "replan"; reason = "multi-signal semantic stagnation"; }
  else if (input.completion && input.completion.shouldContinue >= config.thresholds.completionContinue) { decision = "replan"; reason = "completion evidence insufficient"; }
  else if (input.risk && Math.max(input.risk.unintendedChange, input.risk.broadness, input.risk.approvalNeeded) >= config.thresholds.riskDeny) { decision = "deny"; reason = "very high semantic risk"; }
  else if (input.risk && Math.max(input.risk.unintendedChange, input.risk.broadness, input.risk.approvalNeeded) >= config.thresholds.riskAsk) { decision = "ask"; reason = "semantic risk needs approval"; }
  const intervenes = config.mode === "balanced" || (config.mode === "guardian" && (hard !== undefined || decision === "deny"));
  return { decision: decision === "allow" || intervenes ? decision : "allow", reason, shadow: decision !== "allow" && !intervenes };
}
export type EventType = "SESSION_STARTED" | "SESSION_ENDED" | "ACTION_PROPOSED" | "ACTION_ALLOWED" | "ACTION_ASKED" | "ACTION_DENIED" | "TOOL_COMPLETED" | "TOOL_FAILED" | "REFLEX_STARTED" | "REFLEX_COMPLETED" | "REFLEX_FAILED" | "LOOP_DETECTED" | "REPLAN_REQUESTED" | "REPLAN_QUEUED" | "REPLAN_INJECTED" | "REPLAN_CONTEXT_APPLIED" | "REPLAN_CONSUMED" | "POST_REPLAN_ACTION" | "REPLAN_OUTCOME" | "COMPLETION_EVALUATED" | "COMPLETION_REJECTED" | "BUDGET_EXHAUSTED" | "CONFIG_CHANGED" | "MODE_CHANGED" | "PROVIDER_STATUS";
export interface AthenaEvent { timestamp: string; sessionId: string; type: EventType; metadata: Record<string, unknown> }
export class EventStore { constructor(private readonly path: string, private readonly persist = true) {} async append(event: AthenaEvent): Promise<void> { if (!this.persist) return; await mkdir(dirname(this.path), { recursive: true }); await appendFile(this.path, `${JSON.stringify({ ...event, metadata: JSON.parse(redact(JSON.stringify(event.metadata)) as string) })}\n`); } async read(): Promise<AthenaEvent[]> { try { return (await readFile(this.path, "utf8")).split("\n").filter(Boolean).flatMap((line) => { try { return [JSON.parse(line) as AthenaEvent]; } catch { return []; } }); } catch (error: unknown) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; } } }
export async function loadConfig(root: string): Promise<AthenaConfig> { try { return configSchema.parse(JSON.parse(await readFile(join(root, ".athena", "config.json"), "utf8"))); } catch (error: unknown) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return defaultConfig; throw error; } }
export async function saveConfig(root: string, config: AthenaConfig): Promise<void> { const path = join(root, ".athena", "config.json"); await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(config, null, 2)}\n`); }
export function createSession(goal: string): Session { return { id: randomUUID(), goal, actions: [], results: [], replans: 0, meaningfulActions: 0, jevCalls: 0 }; }
// eslint-disable-next-line no-control-regex -- remove terminal escape sequences from untrusted tool output.
export function normalizeText(value: string, limit = 1500): string { return redact(value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "").replace(/\s+/g, " ").trim()).slice(0, limit); }
export function actionCategory(action: Action): string { if (action.readOnly) return "read"; if (/\b(npm|pnpm|yarn)\s+(install|add|update)/i.test(action.input)) return "package-management"; if (/\b(test|vitest|jest|pytest)\b/i.test(action.input)) return "test"; if (/\b(build|tsc|lint)\b/i.test(action.input)) return "validation"; if (/\b(git)\b/i.test(action.input)) return "git"; return "tool-action"; }
export function strategyFamily(action: Action): string { const text = normalizeText(action.input, 240).toLowerCase(); if (/\b(npm|pnpm|yarn)\s+(install|i)\b/.test(text)) return "dependency-reinstall"; if (/\b(npm|pnpm|yarn)\s+(ls|why|list)\b|package\.json|peer dependen/.test(text)) return "dependency-diagnosis"; if (/\b(chmod|chown)\b/.test(text)) return "permission-change"; if (/\b(docker|compose)\b.*\b(restart|up)\b/.test(text)) return "container-restart"; if (/\b(build|tsc|lint)\b/.test(text)) return "build-validation"; if (/\b(test|vitest|jest|pytest)\b/.test(text)) return "test-validation"; if (/\b(grep|rg|find|cat|sed|read)\b/.test(text)) return "diagnosis"; return text.replace(/--[\w-]+(?:=\S+)?/g, "").replace(/\s+/g, " ").trim(); }
export function isMeaningful(action: Action): boolean { return !action.readOnly && !/^(pwd|ls|git status|find )\b/i.test(normalizeText(action.input, 120)); }
export function extractErrors(output: string): string[] { return normalizeText(output, 4000).split(/(?<=\.)\s+|\n/).filter((line) => /\b(error|failed|exception|enoent|cannot|conflict)\b/i.test(line)).slice(0, 10).map((line) => line.slice(0, 300)); }
export function errorFamily(output: string): string | undefined { return extractErrors(output)[0]?.toLowerCase().replace(/[0-9a-f]{6,}|\d+/g, "#").slice(0, 180); }
export function stateFor(session: Session, action?: Action, result?: ToolResult): ReflexState { const paired = session.actions.slice(-8).map((recentAction) => { const recentResult = session.results.find((item) => item.actionId === recentAction.id); return { tool: recentAction.tool, intent: normalizeText(recentAction.input, 240), category: actionCategory(recentAction), strategy: strategyFamily(recentAction), success: recentResult?.success, resultSummary: recentResult ? normalizeText(recentResult.output, 600) : undefined, errorFamily: recentResult ? errorFamily(recentResult.output) : undefined }; }); const outputs = session.results.slice(-8); const errors = outputs.flatMap((item) => extractErrors(item.output)).slice(-10); const families = outputs.flatMap((item) => errorFamily(item.output) ? [errorFamily(item.output)!] : []); const validation = outputs.filter((item) => /\b(test|vitest|jest|pytest|build|tsc|lint)\b/i.test(item.output)); const status = (name: "build" | "test") => { const relevant = validation.filter((item) => new RegExp(name === "build" ? "build|tsc|lint" : "test|vitest|jest|pytest", "i").test(item.output)); if (!relevant.length) return "unknown" as const; return relevant.some((item) => !item.success) ? "failed" as const : "passed" as const; }; return { goal: normalizeText(session.goal, 4000), proposedAction: action ? { tool: action.tool, intent: normalizeText(action.input, 500), category: actionCategory(action) } : undefined, action, result: result ? { success: result.success, summary: normalizeText(result.output), errors: extractErrors(result.output) } : undefined, recentActions: paired, changedFiles: outputs.flatMap((item) => item.changedFiles ?? []).slice(-20), currentErrors: errors, repeatedErrors: families.filter((family, index) => families.indexOf(family) !== index).slice(-5), buildStatus: status("build"), testStatus: status("test") }; }
export function stagnationEligible(session: Session, config: AthenaConfig): boolean { return session.meaningfulActions >= 3 && session.meaningfulActions % config.budgets.minMeaningfulActionsBetweenStagnationChecks === 0 && (!session.lastReplanMeaningfulAction || session.meaningfulActions - session.lastReplanMeaningfulAction >= config.budgets.replanCooldownMeaningfulActions); }
