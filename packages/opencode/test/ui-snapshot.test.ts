import { describe, expect, it } from "vitest";
import type { CognitiveAssessment } from "@athena/core";
import { createAthenaHudSnapshot, type AthenaHudSnapshot } from "@athena/hud-protocol";
import { buildAthenaUiSnapshot, type AthenaUiCounters } from "../src/index.js";

function assessment(overrides: Record<string, unknown> = {}): CognitiveAssessment {
  return {
    safety: { failureProbability: 0.1, impactSeverity: 0.1, irreversibility: 0.1, policyViolationProbability: 0.1 },
    progress: { progressProbability: 0.8, informationGainProbability: 0.8, strategyNovelty: 0.8, stagnationProbability: 0.1, goalAlignment: 0.9 },
    completion: { goalSatisfiedProbability: 0.1, evidenceCoverage: 0.9, unresolvedObligationsProbability: 0.1 },
    epistemics: { stateUncertainty: 0.1, contextSufficiency: 0.9, contradictionProbability: 0.1 },
    ...overrides,
  } as CognitiveAssessment;
}

function hud(overrides: Partial<Omit<AthenaHudSnapshot, "version">> = {}): AthenaHudSnapshot {
  return createAthenaHudSnapshot({
    sessionId: "session-abc",
    timestamp: 10,
    status: "GO",
    decision: "ALLOW",
    reason: "Action allowed",
    system1: { state: "CLEAR", confidence: 0.9 },
    aegis: { state: "CLEAR", confidence: 0.9 },
    metis: { state: "CLEAR", confidence: 0.9 },
    nike: { state: "CLEAR", confidence: 0.9 },
    epistemics: { state: "GROUNDED", confidence: 0.9 },
    system2: { state: "IDLE" },
    session: { actions: 2, meaningfulActions: 2, replans: 0, system1Calls: 2, system2Calls: 0 },
    timeline: [{ timestamp: 10, type: "DECISION", status: "GO", decision: "ALLOW", reason: "Action allowed" }],
    ...overrides,
  });
}

const counters: AthenaUiCounters = { cycles: 2, deliberations: 0, verifications: 0, blocks: 0, strategyShifts: 0, jevRequests: 1, jevLatencyMs: 120 };

describe("buildAthenaUiSnapshot", () => {
  it("projects a healthy GO snapshot with all four domains", () => {
    const value = buildAthenaUiSnapshot({ hud: hud(), assessment: assessment(), counters });
    expect(value).toMatchObject({
      phase: "GO",
      aegis: "SAFE",
      metis: "PROGRESSING",
      nike: "WORKING",
      epistemics: "CLEAR",
      jev: { requests: 1, latencyMs: 120 },
      lastDecision: { decision: "GO", shortReason: "Action allowed" },
    });
    expect(value.sessionRef).toBe("session-abc");
    expect(value.timeline).toEqual(["GO"]);
  });

  it("maps IDLE to the calm GO posture", () => {
    const value = buildAthenaUiSnapshot({
      hud: hud({ status: "IDLE", decision: "NONE", timeline: [{ timestamp: 10, type: "ACTION", status: "IDLE", decision: "NONE" }] }),
      assessment: assessment(),
      counters,
    });
    expect(value.phase).toBe("GO");
    expect(value.lastDecision).toBeUndefined();
  });

  it("raises AEGIS to DANGER on policy violation", () => {
    const value = buildAthenaUiSnapshot({
      hud: hud(),
      assessment: assessment({ safety: { failureProbability: 0.2, impactSeverity: 0.2, irreversibility: 0.2, policyViolationProbability: 0.99 } }),
      counters,
    });
    expect(value.aegis).toBe("DANGER");
  });

  it("forces the escalated domain for VERIFY, DELIBERATE, SYSTEM2, and BLOCK", () => {
    const verify = buildAthenaUiSnapshot({
      hud: hud({ status: "VERIFY", decision: "ASK", reason: "Verification required", timeline: [{ timestamp: 10, type: "DECISION", status: "VERIFY", decision: "ASK", reason: "Verification required" }] }),
      assessment: assessment(),
      counters,
    });
    expect(verify).toMatchObject({ phase: "VERIFY", nike: "NEEDS_EVIDENCE", lastDecision: { decision: "VERIFY" } });

    const deliberate = buildAthenaUiSnapshot({
      hud: hud({ status: "DELIBERATE", decision: "REPLAN", reason: "Deliberation required", timeline: [{ timestamp: 10, type: "DECISION", status: "DELIBERATE", decision: "REPLAN", reason: "Deliberation required" }] }),
      assessment: assessment(),
      counters,
    });
    expect(deliberate).toMatchObject({ phase: "DELIBERATE", metis: "STAGNATING", lastDecision: { decision: "DELIBERATE" } });

    const system2 = buildAthenaUiSnapshot({
      hud: hud({ status: "SYSTEM2", decision: "REPLAN", timeline: [{ timestamp: 10, type: "SYSTEM2", status: "SYSTEM2", decision: "REPLAN" }] }),
      assessment: assessment(),
      counters,
    });
    expect(system2).toMatchObject({ phase: "SYSTEM2", metis: "STAGNATING" });

    const block = buildAthenaUiSnapshot({
      hud: hud({ status: "BLOCK", decision: "DENY", reason: "Action blocked", timeline: [{ timestamp: 10, type: "DECISION", status: "BLOCK", decision: "DENY", reason: "Action blocked" }] }),
      assessment: assessment(),
      counters,
    });
    expect(block).toMatchObject({ phase: "BLOCK", aegis: "DANGER", lastDecision: { decision: "BLOCK" } });
  });

  it("omits every domain when no assessment exists", () => {
    const value = buildAthenaUiSnapshot({ hud: hud(), counters });
    expect(value.aegis).toBeUndefined();
    expect(value.metis).toBeUndefined();
    expect(value.nike).toBeUndefined();
    expect(value.epistemics).toBeUndefined();
    expect(JSON.stringify(value)).not.toContain("aegis");
    expect(JSON.stringify(value)).not.toContain("epistemics");
  });
});
