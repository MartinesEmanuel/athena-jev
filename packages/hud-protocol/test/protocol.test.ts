import { describe, expect, it } from "vitest";
import { ATHENA_HUD_VERSION, ATHENA_UI_VERSION, athenaUiPhaseSymbol, createAthenaHudSnapshot, createAthenaUiSnapshot, parseAthenaHudSnapshot, parseAthenaUiSnapshot, redactHudText } from "../src/index.js";

const snapshot = () => ({
  sessionId: "session-42", timestamp: 1, status: "ASSESSING" as const, decision: "NONE" as const, reason: "checking state",
  system1: { state: "CLEAR" as const, confidence: 0.9 }, aegis: { state: "CLEAR" as const, confidence: 0.8 }, metis: { state: "WATCH" as const, confidence: 0.6 }, nike: { state: "UNKNOWN" as const, confidence: 0 },
  epistemics: { state: "GROUNDED" as const, confidence: 0.7 }, system2: { state: "IDLE" as const },
  session: { actions: 2, meaningfulActions: 1, replans: 0, system1Calls: 3, system2Calls: 0 },
  timeline: [{ timestamp: 1, type: "ASSESSMENT" as const, status: "ASSESSING" as const, decision: "NONE" as const, reason: "checking state" }],
});

describe("ATHENA HUD protocol", () => {
  it("creates compact versioned redacted snapshots", () => {
    const value = createAthenaHudSnapshot({ ...snapshot(), reason: "Bearer abc.def", timeline: [{ ...snapshot().timeline[0], reason: "token=private" }] });
    expect(value.version).toBe(ATHENA_HUD_VERSION);
    expect(value.reason).toBe("[REDACTED]");
    expect(value.timeline[0]?.reason).toBe("[REDACTED]");
  });

  it("requires requested fields and rejects world, prompt, provider, and secret data", () => {
    expect(() => parseAthenaHudSnapshot({ version: 1, ...snapshot() })).not.toThrow();
    expect(() => parseAthenaHudSnapshot({ version: 1, ...snapshot(), world: {} })).toThrow();
    expect(() => parseAthenaHudSnapshot({ version: 1, ...snapshot(), prompt: "hidden" })).toThrow();
    expect(() => parseAthenaHudSnapshot({ version: 1, ...snapshot(), system1: { rawProvider: "hidden" } })).toThrow();
    expect(() => parseAthenaHudSnapshot({ version: 1, ...snapshot(), reason: "apiKey=private" })).toThrow();
  });

  it("bounds and normalizes presentation text", () => {
    expect(redactHudText("  line\nline\t", 20)).toBe("line line");
    expect(redactHudText("x".repeat(30), 10)).toHaveLength(10);
  });
});

const uiSnapshot = () => ({
  sessionRef: "session-abc123",
  timestamp: 1,
  phase: "GO" as const,
  aegis: "SAFE" as const,
  metis: "PROGRESSING" as const,
  nike: "WORKING" as const,
  epistemics: "CLEAR" as const,
  jev: { requests: 3, latencyMs: 120 },
  session: { cycles: 3, deliberations: 0, verifications: 0, blocks: 0, strategyShifts: 0 },
  lastDecision: { decision: "GO" as const },
  timeline: ["ASSESSING", "GO"],
});

describe("ATHENA UI snapshot contract", () => {
  it("validates a strict terminal-facing contract with no raw payload fields", () => {
    const value = createAthenaUiSnapshot(uiSnapshot());
    expect(value.version).toBe(ATHENA_UI_VERSION);
    expect(() => parseAthenaUiSnapshot({ ...value, prompt: "hidden" })).toThrow();
    expect(() => parseAthenaUiSnapshot({ ...value, toolInput: { command: "x" } })).toThrow();
    expect(() => parseAthenaUiSnapshot({ ...value, provider: { raw: "x" } })).toThrow();
    expect(() => parseAthenaUiSnapshot({ ...value, aegis: "UNKNOWN" })).toThrow();
    expect(() => parseAthenaUiSnapshot({ ...value, timeline: Array(17).fill("GO") })).toThrow();
  });

  it("redacts and bounds lastDecision reasons before they cross into the TUI", () => {
    const value = createAthenaUiSnapshot({
      ...uiSnapshot(),
      lastDecision: { decision: "BLOCK", shortReason: `blocked token=secret-value ${"x".repeat(300)}` },
    });
    const reason = value.lastDecision?.shortReason ?? "";
    expect(reason).toContain("[REDACTED]");
    expect(reason).not.toContain("secret-value");
    expect(reason.length).toBeLessThanOrEqual(96);
  });

  it("caps the timeline at 16 phases and exposes the fixed symbol set", () => {
    const value = createAthenaUiSnapshot({ ...uiSnapshot(), timeline: Array(20).fill("GO") });
    expect(value.timeline).toHaveLength(16);
    expect(athenaUiPhaseSymbol).toEqual({
      ASSESSING: "◌", GO: "●", DELIBERATE: "◆", VERIFY: "◇", BLOCK: "■", SYSTEM2: "◈", DEGRADED: "!",
    });
  });
});
