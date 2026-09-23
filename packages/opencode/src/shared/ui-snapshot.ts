import { createHash } from "node:crypto";
import type { AthenaEnforcementMode, CognitiveAssessment } from "@athena/core";
import { createAthenaUiSnapshot, type AthenaHudSnapshot, type AthenaUiAegis, type AthenaUiDecision, type AthenaUiEpistemics, type AthenaUiMetis, type AthenaUiNike, type AthenaUiPhase, type AthenaUiSnapshot } from "@athena/hud-protocol";

/**
 * Presentation boundary for the native OpenCode V2 TUI.
 *
 * The cognitive runtime is authoritative; this module only projects already
 * redacted telemetry into the terminal-facing contract. It never reads
 * prompts, chain-of-thought, tool inputs, tool outputs or provider payloads,
 * so those cannot cross into the UI by construction.
 */
export interface AthenaUiObserver {
  publish(snapshot: AthenaUiSnapshot): void | Promise<void>;
}

export interface AthenaUiCounters {
  readonly cycles: number;
  readonly deliberations: number;
  readonly verifications: number;
  readonly blocks: number;
  readonly strategyShifts: number;
  readonly jevRequests: number;
  readonly jevLatencyMs?: number;
  readonly enforcementMode?: AthenaEnforcementMode;
}

export interface AthenaUiDecisionNote {
  readonly decision: AthenaUiDecision;
  readonly shortReason?: string;
}

/** Stable, non-reversible session reference shared by HUD and TUI contracts. */
export function athenaSessionRef(sessionID: string): string {
  return `session-${createHash("sha256").update(sessionID).digest("hex").slice(0, 16)}`;
}

/** Risk and safety. */
export function uiAegis(assessment: CognitiveAssessment): AthenaUiAegis {
  const risk = Math.max(assessment.safety.failureProbability, assessment.safety.policyViolationProbability, assessment.safety.impactSeverity, assessment.safety.irreversibility);
  return risk >= 0.75 ? "DANGER" : risk >= 0.4 ? "CAUTION" : "SAFE";
}

/** Progress, information gain and stagnation. */
export function uiMetis(assessment: CognitiveAssessment): AthenaUiMetis {
  const stall = Math.max(1 - assessment.progress.progressProbability, assessment.progress.stagnationProbability);
  return stall >= 0.75 ? "STAGNATING" : stall >= 0.4 ? "EXPLORING" : "PROGRESSING";
}

/** Completion, evidence and unresolved obligations. */
export function uiNike(assessment: CognitiveAssessment): AthenaUiNike {
  const gap = Math.max(1 - assessment.completion.evidenceCoverage, assessment.completion.unresolvedObligationsProbability);
  if (gap >= 0.75 || assessment.completion.evidenceCoverage < 0.4) return "NEEDS_EVIDENCE";
  if (assessment.completion.goalSatisfiedProbability >= 0.75 && gap < 0.4) return "COMPLETE";
  return "WORKING";
}

/** Uncertainty, context sufficiency and contradiction. */
export function uiEpistemics(assessment: CognitiveAssessment): AthenaUiEpistemics {
  if (assessment.epistemics.contradictionProbability >= 0.75) return "CONTRADICTORY";
  if (assessment.epistemics.stateUncertainty >= 0.4 || assessment.epistemics.contextSufficiency < 0.5) return "UNCERTAIN";
  return "CLEAR";
}

function phaseOf(status: AthenaHudSnapshot["status"]): AthenaUiPhase {
  switch (status) {
    case "IDLE": return "GO";
    case "ASSESSING": case "GO": case "DELIBERATE": case "VERIFY": case "BLOCK": case "SYSTEM2": case "DEGRADED": return status;
  }
}

export function uiDecision(decision: AthenaHudSnapshot["decision"]): AthenaUiDecision | undefined {
  switch (decision) {
    case "ALLOW": return "GO";
    case "DENY": return "BLOCK";
    case "ASK": return "VERIFY";
    case "REPLAN": return "DELIBERATE";
    case "NONE": return undefined;
  }
}

function decisionNote(hud: AthenaHudSnapshot): AthenaUiDecisionNote | undefined {
  if (hud.timeline.at(-1)?.type !== "DECISION") return undefined;
  const decision = uiDecision(hud.decision);
  return decision ? { decision, shortReason: hud.reason } : undefined;
}

export interface AthenaUiInput {
  readonly hud: AthenaHudSnapshot;
  readonly assessment?: CognitiveAssessment;
  readonly counters: AthenaUiCounters;
  readonly lastDecision?: AthenaUiDecisionNote;
}

/**
 * Projects the runtime's redacted HUD snapshot into the terminal contract.
 *
 * Phase is authoritative: a decision that escalated always overrides the
 * domain row it depends on (VERIFY forces NIKE, DELIBERATE forces METIS,
 * BLOCK forces AEGIS) so the panel never contradicts the decision.
 */
export function buildAthenaUiSnapshot(input: AthenaUiInput): AthenaUiSnapshot {
  const { hud, assessment, counters, lastDecision } = input;
  const phase = phaseOf(hud.status);
  let aegis = assessment ? uiAegis(assessment) : undefined;
  let metis = assessment ? uiMetis(assessment) : undefined;
  let nike = assessment ? uiNike(assessment) : undefined;
  const epistemics = assessment ? uiEpistemics(assessment) : undefined;

  if (phase === "BLOCK") aegis = "DANGER";
  if (phase === "DELIBERATE" || phase === "SYSTEM2") metis = "STAGNATING";
  if (phase === "VERIFY") nike = "NEEDS_EVIDENCE";

  const decision = lastDecision ?? decisionNote(hud);

  return createAthenaUiSnapshot({
    sessionRef: hud.sessionId,
    timestamp: hud.timestamp,
    phase,
    ...(aegis ? { aegis } : {}),
    ...(metis ? { metis } : {}),
    ...(nike ? { nike } : {}),
    ...(epistemics ? { epistemics } : {}),
    jev: { requests: counters.jevRequests, ...(counters.jevLatencyMs === undefined ? {} : { latencyMs: Math.max(0, Math.round(counters.jevLatencyMs)) }) },
    session: {
      cycles: counters.cycles,
      deliberations: counters.deliberations,
      verifications: counters.verifications,
      blocks: counters.blocks,
      strategyShifts: counters.strategyShifts,
    },
    ...(decision ? { lastDecision: decision } : {}),
    ...(counters.enforcementMode ? { enforcementMode: counters.enforcementMode } : {}),
    timeline: hud.timeline.map((event) => phaseOf(event.status)),
  });
}
