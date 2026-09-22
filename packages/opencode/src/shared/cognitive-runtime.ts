import { CognitivePolicy, assessStrategyShift, buildCognitiveWorldState, buildDeliberationRequest, initialCognitiveState, normalizeText, policyResultToDecisionEvent, policyResultToEvidenceEvent, renderDeliberationContext, transitionCognitiveState, type CognitiveState, type StrategyFrame, type System1Snapshot } from "@athena/core";
import { createAthenaHudSnapshot, type AthenaHudObserver, type AthenaHudSnapshot, type AthenaHudTimelineEvent } from "@athena/hud-protocol";
import { athenaSessionRef, buildAthenaUiSnapshot, uiDecision, type AthenaUiCounters, type AthenaUiDecisionNote, type AthenaUiObserver } from "./ui-snapshot.js";

const MAX_GOAL_LENGTH = 1000;
const MAX_EVIDENCE_LENGTH = 1000;
const HUD_TIMELINE_LIMIT = 12;
const VERIFY_CONTEXT = [
  "ATHENA VERIFICATION REQUIRED",
  "",
  "Do not claim completion yet.",
  "Run or inspect evidence that verifies unresolved requirements before continuing.",
].join("\n");

export interface System1Runtime {
  assess(world: ReturnType<typeof buildCognitiveWorldState>): Promise<System1Snapshot>;
  latestTelemetry?: { readonly requestCount: number; readonly questionCount: number; readonly latencyMs: number; };
}

export interface CognitiveSessionCounters {
  readonly candidates: number;
  readonly assessments: number;
  readonly allowed: number;
  readonly blocked: number;
  readonly deliberations: number;
  readonly verifications: number;
  readonly degraded: number;
  readonly jevRequests: number;
  readonly jevQuestions: number;
  readonly jevTotalLatencyMs: number;
  readonly interventions: number;
  readonly meaningfulStrategyShifts: number;
  readonly noMeaningfulStrategyShifts: number;
  readonly worldStateChars: number;
}

export interface CognitiveSessionSummary extends CognitiveSessionCounters {
  readonly sessionID: string;
  readonly phase: CognitiveState["phase"];
  readonly goalCaptured: boolean;
  readonly pendingContext: "DELIBERATE" | "VERIFY" | null;
  readonly lastDecision: ReturnType<CognitivePolicy["evaluate"]>["decision"] | null;
  readonly jevAverageLatencyMs: number;
  readonly worldStateAverageChars: number;
  readonly tokens: "unavailable";
}

interface PendingContext {
  readonly decision: "DELIBERATE" | "VERIFY";
  readonly text: string;
  readonly strategy: StrategyFrame;
}

interface RuntimeSession {
  goal: string;
  state: CognitiveState;
  events: Parameters<typeof transitionCognitiveState>[1][];
  recentActions: ReturnType<typeof buildCognitiveWorldState>["recentActions"];
  recentStrategies: ReturnType<typeof buildCognitiveWorldState>["recentStrategies"];
  observation: ReturnType<typeof buildCognitiveWorldState>["currentObservation"];
  pendingContext: PendingContext | null;
  awaitingStrategy: StrategyFrame | null;
  counters: CognitiveSessionCounters;
  hudTimeline: AthenaHudTimelineEvent[];
  lastUiDecision: AthenaUiDecisionNote | null;
  lastUiAssessment?: System1Snapshot["assessment"];
}

function emptyCounters(): CognitiveSessionCounters {
  return { candidates: 0, assessments: 0, allowed: 0, blocked: 0, deliberations: 0, verifications: 0, degraded: 0, jevRequests: 0, jevQuestions: 0, jevTotalLatencyMs: 0, interventions: 0, meaningfulStrategyShifts: 0, noMeaningfulStrategyShifts: 0, worldStateChars: 0 };
}

function compact(value: unknown, limit = MAX_EVIDENCE_LENGTH): string {
  try {
    return normalizeText(typeof value === "string" ? value : JSON.stringify(value), limit) || "no details";
  } catch {
    return "unserializable tool input";
  }
}

function promptText(value: unknown): string {
  if (typeof value === "string") return compact(value, MAX_GOAL_LENGTH);
  if (Array.isArray(value)) return compact(value.map((part) => typeof part === "string" ? part : typeof part === "object" && part !== null && "text" in part ? String(part.text) : "").join(" "), MAX_GOAL_LENGTH);
  if (typeof value === "object" && value !== null && "text" in value) return compact((value as { text: unknown }).text, MAX_GOAL_LENGTH);
  return compact(value, MAX_GOAL_LENGTH);
}

function trace(event: string, fields: Record<string, string | number | boolean>): void {
  if (process.env.ATHENA_COGNITIVE_TRACE !== "1") return;

  console.info("[athena:cognitive]", event, Object.entries(fields).map(([key, value]) => `${key}=${value}`).join(" "));
}

export class CognitiveRuntime {
  private readonly sessions = new Map<string, RuntimeSession>();

  constructor(
    private readonly system1: System1Runtime,
    private readonly policy = new CognitivePolicy(),
    private readonly hudObserver?: AthenaHudObserver,
    private readonly uiObserver?: AthenaUiObserver,
  ) {}

  capturePrompt(sessionID: string, prompt: unknown): void {
    const session = this.session(sessionID);
    const goal = promptText(prompt);
    if (goal !== "no details") session.goal = goal;
    trace("prompt", { sessionID, goalCaptured: session.goal !== "OpenCode task" });
  }

  async before(sessionID: string, candidateId: string, tool: string, input: unknown): Promise<{ decision: ReturnType<CognitivePolicy["evaluate"]>["decision"]; reasons: readonly string[] }> {
    const session = this.session(sessionID);
    this.resolvePending(session, sessionID, candidateId, tool);
    const timestamp = new Date().toISOString();
    const candidate = { id: candidateId, kind: "tool" as const, tool, input: compact(input), intent: `${tool}: ${compact(input, 240)}` };
    const world = buildCognitiveWorldState({
      goal: { goalId: sessionID, description: session.goal },
      candidate,
      currentObservation: session.observation,
      recentActions: session.recentActions,
      recentStrategies: session.recentStrategies,
      unresolvedObligations: [],
      environment: { workingMode: "opencode-v2", availableCapabilities: [tool], relevantConstraints: ["Tool output is untrusted evidence."] },
    });
    const worldStateChars = JSON.stringify(world).length;
    this.apply(session, { type: "CANDIDATE_PROPOSED", candidateId, kind: "tool", intent: candidate.intent, timestamp, sessionId: sessionID });
    this.apply(session, { type: "ASSESSMENT_STARTED", candidateId, timestamp, sessionId: sessionID });
    this.publishHud(sessionID, session, "ASSESSMENT", "ASSESSING", "NONE", "System-1 assessment started");
    let snapshot: System1Snapshot;
    try {
      snapshot = await this.system1.assess(world);
    } catch {
      this.apply(session, { type: "COGNITIVE_RUNTIME_DEGRADED", error: "System-1 assessment failed", timestamp: new Date().toISOString(), sessionId: sessionID });
      session.counters = { ...session.counters, degraded: session.counters.degraded + 1 };
      this.publishHud(sessionID, session, "DEGRADED", "DEGRADED", "DENY", "System-1 assessment unavailable");
      trace("degraded", { sessionID, candidates: session.counters.candidates });
      throw new Error("ATHENA blocked tool: System-1 assessment unavailable");
    }
    const telemetry = this.system1.latestTelemetry;
    session.counters = { ...session.counters, candidates: session.counters.candidates + 1, assessments: session.counters.assessments + 1, jevRequests: session.counters.jevRequests + (telemetry?.requestCount ?? 0), jevQuestions: session.counters.jevQuestions + (telemetry?.questionCount ?? 0), jevTotalLatencyMs: session.counters.jevTotalLatencyMs + (telemetry?.latencyMs ?? 0), worldStateChars: session.counters.worldStateChars + worldStateChars };
    this.apply(session, { type: "ASSESSMENT_COMPLETED", candidateId, assessment: snapshot.assessment, timestamp: new Date().toISOString(), sessionId: sessionID });
    const result = this.policy.evaluate(snapshot.assessment, session.state, snapshot.worldState);
    this.apply(session, policyResultToEvidenceEvent(result, candidateId, new Date().toISOString(), sessionID));
    this.apply(session, policyResultToDecisionEvent(result, snapshot.assessment, candidateId, new Date().toISOString(), sessionID));
    // Decision counters move before the DECISION snapshot so an observer never
    // sees a decision whose own tally is still stale.
    if (result.decision === "GO") session.counters = { ...session.counters, allowed: session.counters.allowed + 1 };
    if (result.decision === "BLOCK") session.counters = { ...session.counters, blocked: session.counters.blocked + 1 };
    if (result.decision === "DELIBERATE") session.counters = { ...session.counters, deliberations: session.counters.deliberations + 1, interventions: session.counters.interventions + 1 };
    if (result.decision === "VERIFY") session.counters = { ...session.counters, verifications: session.counters.verifications + 1, interventions: session.counters.interventions + 1 };
    this.publishHud(sessionID, session, "DECISION", result.decision, hudDecision(result.decision), hudReason(result.decision), snapshot.assessment);
    trace("cycle", { sessionID, cycle: session.counters.assessments, worldChars: worldStateChars, evidence: world.recentActions.length + (world.currentObservation ? 1 : 0), untrustedEvidence: world.recentActions.filter((item) => item.provenance.trust === "UNTRUSTED").length + (world.currentObservation?.provenance.trust === "UNTRUSTED" ? 1 : 0), jevRequests: telemetry?.requestCount ?? 0, jevQuestions: telemetry?.questionCount ?? 0, jevLatencyMs: telemetry?.latencyMs ?? 0, decision: result.decision, failure: snapshot.assessment.safety.failureProbability, impactSeverity: snapshot.assessment.safety.impactSeverity, irreversibility: snapshot.assessment.safety.irreversibility, policyViolation: snapshot.assessment.safety.policyViolationProbability, progress: snapshot.assessment.progress.progressProbability, informationGain: snapshot.assessment.progress.informationGainProbability, novelty: snapshot.assessment.progress.strategyNovelty, stagnation: snapshot.assessment.progress.stagnationProbability, goalAlignment: snapshot.assessment.progress.goalAlignment, goalSatisfied: snapshot.assessment.completion.goalSatisfiedProbability, evidenceCoverage: snapshot.assessment.completion.evidenceCoverage, unresolved: snapshot.assessment.completion.unresolvedObligationsProbability, uncertainty: snapshot.assessment.epistemics.stateUncertainty, contextSufficiency: snapshot.assessment.epistemics.contextSufficiency, contradiction: snapshot.assessment.epistemics.contradictionProbability });

    if (result.decision === "GO") {
      this.apply(session, { type: "ACTION_ALLOWED", candidateId, timestamp: new Date().toISOString(), sessionId: sessionID });
      this.publishHud(sessionID, session, "ACTION", "GO", "ALLOW", "Action allowed", snapshot.assessment);
      return result;
    }
    if (result.decision === "BLOCK") {
      throw new Error(`ATHENA blocked ${tool}: ${result.reasons.join(", ")}`);
    }
    if (result.decision === "DELIBERATE") {
      const request = buildDeliberationRequest(`deliberation_${candidateId}`, result, snapshot.worldState, snapshot.assessment);
      const context = renderDeliberationContext(request);
      this.apply(session, { type: "DELIBERATION_REQUESTED", candidateId, reasons: result.reasons, timestamp: new Date().toISOString(), sessionId: sessionID });
      this.apply(session, { type: "DELIBERATION_APPLIED", candidateId, outcome: "CONTEXT_QUEUED", timestamp: new Date().toISOString(), sessionId: sessionID });
      session.pendingContext = { decision: "DELIBERATE", text: context.text, strategy: request.currentStrategy };
      this.publishHud(sessionID, session, "SYSTEM2", "SYSTEM2", "REPLAN", "Deliberation context queued", snapshot.assessment);
      throw new Error(`ATHENA deliberation required for ${tool}: ${result.reasons.join(", ")}`);
    }
    this.apply(session, { type: "VERIFICATION_REQUESTED", candidateId, timestamp: new Date().toISOString(), sessionId: sessionID });
    session.pendingContext = { decision: "VERIFY", text: VERIFY_CONTEXT, strategy: { strategyId: candidateId, intent: candidate.intent, approach: candidate.tool } };
    this.publishHud(sessionID, session, "VERIFY", "VERIFY", "ASK", "Verification required", snapshot.assessment);
    throw new Error(`ATHENA verification required for ${tool}: ${result.reasons.join(", ")}`);
  }

  after(sessionID: string, candidateId: string, tool: string, status: "completed" | "error", output: unknown): void {
    const session = this.session(sessionID);
    if (session.state.phase !== "EXECUTING" || session.state.activeCandidateId !== candidateId) return;
    const summary = compact(output);
    const outcome = status === "completed" ? "SUCCESS" as const : "FAILURE" as const;
    const observation = { source: tool, summary, outcome, ...(status === "error" ? { errorSummary: summary } : {}), provenance: { source: "TOOL" as const, epistemicStatus: "OBSERVED" as const, trust: "UNTRUSTED" as const } };
    session.observation = observation;
    session.recentActions = [...session.recentActions, { candidateId, kind: "tool" as const, tool, intent: tool, outcome, ...(status === "completed" ? { informationSummary: summary } : { errorSummary: summary }), provenance: observation.provenance }].slice(-12);
    session.recentStrategies = [...session.recentStrategies, { strategyId: `tool-${candidateId}`, intent: tool, approach: tool, provenance: { source: "ATHENA" as const, epistemicStatus: "PROPOSED" as const, trust: "UNTRUSTED" as const } }].slice(-6);
    this.apply(session, { type: "TOOL_COMPLETED", candidateId, timestamp: new Date().toISOString(), sessionId: sessionID });
    this.publishHud(sessionID, session, "ACTION", "GO", "ALLOW", status === "completed" ? "Tool result observed" : "Tool error observed");
    trace("observed", { sessionID, status, actions: session.recentActions.length });
  }

  injectContext(sessionID: string): string | null {
    const session = this.session(sessionID);
    const pending = session.pendingContext;
    if (!pending) return null;
    session.pendingContext = null;
    if (pending.decision === "DELIBERATE") session.awaitingStrategy = pending.strategy;
    this.publishHud(sessionID, session, "SYSTEM2", "SYSTEM2", pending.decision === "DELIBERATE" ? "REPLAN" : "ASK", "Cognitive context injected");
    trace("context", { sessionID, decision: pending.decision });
    return pending.text;
  }

  counters(sessionID: string): CognitiveSessionCounters { return { ...this.session(sessionID).counters }; }

  summary(sessionID: string): CognitiveSessionSummary {
    const session = this.session(sessionID);
    return { sessionID, ...session.counters, phase: session.state.phase, goalCaptured: session.goal !== "OpenCode task", pendingContext: session.pendingContext?.decision ?? null, lastDecision: session.state.lastDecision, jevAverageLatencyMs: session.counters.jevRequests === 0 ? 0 : Math.round(session.counters.jevTotalLatencyMs / session.counters.jevRequests), worldStateAverageChars: session.counters.assessments === 0 ? 0 : Math.round(session.counters.worldStateChars / session.counters.assessments), tokens: "unavailable" };
  }

  private session(sessionID: string): RuntimeSession {
    let session = this.sessions.get(sessionID);
    if (!session) {
      session = { goal: "OpenCode task", state: initialCognitiveState(), events: [], recentActions: [], recentStrategies: [], observation: null, pendingContext: null, awaitingStrategy: null, counters: emptyCounters(), hudTimeline: [], lastUiDecision: null };
      this.sessions.set(sessionID, session);
    }
    return session;
  }

  private apply(session: RuntimeSession, event: Parameters<typeof transitionCognitiveState>[1]): void {
    session.state = transitionCognitiveState(session.state, event);
    session.events.push(event);
  }

  private resolvePending(session: RuntimeSession, sessionID: string, nextCandidateId: string, tool: string): void {
    const timestamp = new Date().toISOString();
    if (session.state.phase === "AWAITING_STRATEGY_SHIFT") {
      const candidateId = session.state.pendingDeliberationCandidateId!;
      const previous = session.awaitingStrategy;
      const shift = previous ? assessStrategyShift(previous, { strategyId: `tool-${nextCandidateId}`, intent: tool, approach: tool, supersedesStrategyId: previous.strategyId }) : null;
      session.counters = shift?.strategyChanged ? { ...session.counters, meaningfulStrategyShifts: session.counters.meaningfulStrategyShifts + 1 } : { ...session.counters, noMeaningfulStrategyShifts: session.counters.noMeaningfulStrategyShifts + 1 };
      session.awaitingStrategy = null;
      this.apply(session, { type: "STRATEGY_SHIFT_OBSERVED", candidateId, from: "previous strategy", to: `${tool}: ${compact(tool, 120)}`, timestamp, sessionId: sessionID });
      this.publishHud(sessionID, session, "SYSTEM2", "SYSTEM2", shift?.strategyChanged ? "REPLAN" : "NONE", shift?.strategyChanged ? "Strategy shift observed" : "Strategy unchanged");
    }
    if (session.state.phase === "AWAITING_VERIFICATION") {
      const candidateId = session.state.pendingVerificationCandidateId!;
      this.apply(session, { type: "VERIFICATION_COMPLETED", candidateId, passed: false, timestamp, sessionId: sessionID });
    }
    if (session.state.phase === "DEGRADED") throw new Error("ATHENA blocked tool: cognitive runtime degraded");
    if (session.state.phase !== "READY") throw new Error(`ATHENA blocked tool: unresolved cognitive lifecycle before ${nextCandidateId}`);
  }

  private publishHud(
    sessionID: string,
    session: RuntimeSession,
    type: AthenaHudTimelineEvent["type"],
    status: AthenaHudSnapshot["status"],
    decision: AthenaHudSnapshot["decision"],
    reason: string,
    assessment?: System1Snapshot["assessment"],
  ): void {
    if (!this.hudObserver && !this.uiObserver) return;
    const timestamp = Date.now();
    session.hudTimeline = [...session.hudTimeline, { timestamp, type, status, decision, reason }].slice(-HUD_TIMELINE_LIMIT);
    // The UI projection carries the last real domain readings forward so the
    // panel keeps showing them on publishes without an assessment (tool
    // results, System-2 notes). DEGRADED must never show stale domains.
    const uiAssessment = assessment ?? (status === "DEGRADED" ? undefined : session.lastUiAssessment);
    if (assessment) session.lastUiAssessment = assessment;
    if (type === "DECISION") {
      const note = uiDecision(decision);
      session.lastUiDecision = note ? { decision: note, shortReason: reason } : null;
    }
    try {
      const snapshot = createAthenaHudSnapshot({
        sessionId: athenaSessionRef(sessionID),
        timestamp,
        status,
        decision,
        reason,
        system1: hudSystem1(assessment),
        aegis: hudAegis(assessment),
        metis: hudMetis(assessment),
        nike: hudNike(assessment),
        epistemics: hudEpistemics(assessment),
        system2: { state: status === "SYSTEM2" ? "QUEUED" : "IDLE" },
        session: { actions: session.counters.candidates, meaningfulActions: session.counters.allowed, replans: session.counters.interventions, system1Calls: session.counters.assessments, system2Calls: session.counters.deliberations + session.counters.verifications },
        timeline: session.hudTimeline,
      });
      const counters: AthenaUiCounters = {
        cycles: session.counters.assessments,
        deliberations: session.counters.deliberations,
        verifications: session.counters.verifications,
        blocks: session.counters.blocked,
        strategyShifts: session.counters.meaningfulStrategyShifts,
        jevRequests: session.counters.jevRequests,
        jevLatencyMs: session.counters.jevRequests === 0 ? 0 : Math.round(session.counters.jevTotalLatencyMs / session.counters.jevRequests),
      };
      const lastDecision = session.lastUiDecision ?? undefined;
      queueMicrotask(() => {
        if (this.hudObserver) {
          try {
            void Promise.resolve(this.hudObserver.publish(snapshot)).catch(() => undefined);
          } catch {
            // Observer failures must never affect cognition.
          }
        }
        if (this.uiObserver) {
          try {
            void Promise.resolve(this.uiObserver.publish(buildAthenaUiSnapshot({ hud: snapshot, assessment: uiAssessment, counters, lastDecision }))).catch(() => undefined);
          } catch {
            // Observer failures must never affect cognition.
          }
        }
      });
    } catch {
      // HUD/UI telemetry must never affect cognition.
    }
  }
}

function hudDecision(decision: ReturnType<CognitivePolicy["evaluate"]>["decision"]): AthenaHudSnapshot["decision"] {
  return decision === "GO" ? "ALLOW" : decision === "BLOCK" ? "DENY" : decision === "VERIFY" ? "ASK" : "REPLAN";
}

function hudReason(decision: ReturnType<CognitivePolicy["evaluate"]>["decision"]): string {
  return decision === "GO" ? "Action allowed" : decision === "BLOCK" ? "Action blocked" : decision === "VERIFY" ? "Verification required" : "Deliberation required";
}

function hudState(value: number): "CLEAR" | "WATCH" | "ALERT" {
  return value >= 0.75 ? "ALERT" : value >= 0.4 ? "WATCH" : "CLEAR";
}

function hudSystem1(assessment?: System1Snapshot["assessment"]): AthenaHudSnapshot["system1"] {
  if (!assessment) return { state: "UNKNOWN", confidence: 0 };
  const risk = Math.max(assessment.safety.failureProbability, assessment.safety.policyViolationProbability, assessment.progress.stagnationProbability, assessment.epistemics.contradictionProbability);
  return { state: hudState(risk), confidence: 1 - assessment.epistemics.stateUncertainty };
}

function hudAegis(assessment?: System1Snapshot["assessment"]): AthenaHudSnapshot["aegis"] {
  if (!assessment) return { state: "UNKNOWN", confidence: 0 };
  return { state: hudState(Math.max(assessment.safety.failureProbability, assessment.safety.policyViolationProbability, assessment.safety.impactSeverity, assessment.safety.irreversibility)), confidence: 1 - assessment.safety.failureProbability };
}

function hudMetis(assessment?: System1Snapshot["assessment"]): AthenaHudSnapshot["metis"] {
  if (!assessment) return { state: "UNKNOWN", confidence: 0 };
  return { state: hudState(Math.max(1 - assessment.progress.progressProbability, assessment.progress.stagnationProbability)), confidence: assessment.progress.goalAlignment };
}

function hudNike(assessment?: System1Snapshot["assessment"]): AthenaHudSnapshot["nike"] {
  if (!assessment) return { state: "UNKNOWN", confidence: 0 };
  return { state: hudState(Math.max(1 - assessment.completion.evidenceCoverage, assessment.completion.unresolvedObligationsProbability)), confidence: assessment.completion.evidenceCoverage };
}

function hudEpistemics(assessment?: System1Snapshot["assessment"]): AthenaHudSnapshot["epistemics"] {
  if (!assessment) return { state: "UNKNOWN", confidence: 0 };
  const risk = Math.max(assessment.epistemics.stateUncertainty, assessment.epistemics.contradictionProbability);
  return { state: assessment.epistemics.contradictionProbability >= 0.75 ? "CONFLICTED" : risk >= 0.4 ? "MIXED" : "GROUNDED", confidence: assessment.epistemics.contextSufficiency };
}

export function getCognitiveSessionCounters(runtime: CognitiveRuntime, sessionID: string): CognitiveSessionCounters { return runtime.counters(sessionID); }
export function getCognitiveSessionSummary(runtime: CognitiveRuntime, sessionID: string): CognitiveSessionSummary { return runtime.summary(sessionID); }
