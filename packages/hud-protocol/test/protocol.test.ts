import { describe, expect, it } from "vitest";
import { ATHENA_HUD_VERSION, createAthenaHudSnapshot, parseAthenaHudSnapshot, redactHudText } from "../src/index.js";

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
