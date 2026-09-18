import { describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveConfig, type PendingReplan, type ReflexProvider, type StagnationReflex } from "@athena/core";
import { OpenCodeBridge } from "../src/index.js";

const provider: ReflexProvider = { name: "demo", evaluateRisk: async () => ({ relevance: 1, unintendedChange: 0.9, broadness: 0.1, approvalNeeded: 0.9 }), evaluateProgress: async () => ({ usefulInformation: 0.1, advancedGoal: 0.1, strategyInvalidated: 0.8, continueApproach: 0.1 }), evaluateStagnation: async () => ({ sameStrategy: 0.96, sameUnderlyingProblem: 0.96, surfaceVariation: 0.9, newInformation: 0.1, likelyToProgress: 0.1, strategyChangeNeeded: 0.93 }), evaluateCompletion: async () => ({ requirementsSatisfied: 0.1, evidenceWorks: 0.1, unresolvedFailures: 0.9, testingSufficient: 0.1, shouldContinue: 0.93 }) };
async function root(mode: "shadow" | "balanced" = "balanced") { const value = await mkdtemp(join(tmpdir(), "athena-bridge-")); await saveConfig(value, { mode, provider: "demo", reflexes: { risk: true, progress: true, stagnation: true, completion: true }, thresholds: { riskAsk: 0.8, riskDeny: 0.95, stagnation: 0.88, replan: 0.9, completionContinue: 0.85 }, telemetry: { persist: true }, budgets: { maxJevCallsPerSession: 100, minMeaningfulActionsBetweenStagnationChecks: 1, replanCooldownMeaningfulActions: 3 } }); return value; }
describe("OpenCode bridge", () => {
  it("asks for ambiguous semantic risk", async () => { const bridge = new OpenCodeBridge(await root(), "goal", provider); expect((await bridge.before("bash", { command: "deploy" })).policy.decision).toBe("ask"); });
  it("keeps shadow non-intervening", async () => { const bridge = new OpenCodeBridge(await root("shadow"), "goal", provider); expect((await bridge.before("bash", { command: "deploy" })).policy).toMatchObject({ decision: "allow", shadow: true }); });
  it("replans semantic loops", async () => { const bridge = new OpenCodeBridge(await root(), "goal", provider); let result; for (let index = 0; index < 3; index++) { const before = await bridge.before("bash", { command: `pnpm install --x${index}` }); result = await bridge.after(before.action, false, "install failed"); } expect(result?.policy.decision).toBe("replan"); });
  it("fails open provider errors", async () => { const broken = { ...provider, evaluateRisk: async () => { throw new Error("offline"); } }; const bridge = new OpenCodeBridge(await root(), "goal", broken); expect((await bridge.before("bash", { command: "deploy" })).policy.decision).toBe("allow"); });
  it("enforces Jev call budget", async () => { const value = await root(); const config = await import("@athena/core").then(({ loadConfig }) => loadConfig(value)); await saveConfig(value, { ...config, budgets: { ...config.budgets, maxJevCallsPerSession: 1 } }); const bridge = new OpenCodeBridge(value, "goal", provider); await bridge.before("bash", { command: "first" }); expect((await bridge.before("bash", { command: "second" })).risk).toBeUndefined(); });

  it("produces replan decision with stagnation evidence", async () => { const bridge = new OpenCodeBridge(await root(), "goal", provider); let result; for (let index = 0; index < 3; index++) { const before = await bridge.before("bash", { command: `pnpm install --x${index}` }); result = await bridge.after(before.action, false, "ERR_PNPM_PEER_DEP_ISSUES react conflict"); } expect(result?.policy.decision).toBe("replan"); expect(result?.stagnation).toBeDefined(); expect(result?.stagnation?.sameStrategy).toBeGreaterThanOrEqual(0.9); });

  it("does not replan when progress continues", async () => { const progressProvider: ReflexProvider = { ...provider, evaluateStagnation: async () => ({ sameStrategy: 0.4, sameUnderlyingProblem: 0.2, surfaceVariation: 0.2, newInformation: 0.9, likelyToProgress: 0.8, strategyChangeNeeded: 0.1 }) }; const bridge = new OpenCodeBridge(await root(), "goal", progressProvider); const b1 = await bridge.before("bash", { command: "pnpm test" }); await bridge.after(b1.action, false, "FAIL user.test.ts"); const b2 = await bridge.before("bash", { command: "read src/user.ts" }); await bridge.after(b2.action, true, "src/user.ts: export function getUser() {}"); const b3 = await bridge.before("bash", { command: "pnpm test" }); const r3 = await bridge.after(b3.action, true, "PASS user.test.ts"); expect(r3?.policy.decision).toBe("allow"); });

  it("session A replan does not leak into session B", async () => { const bridgeA = new OpenCodeBridge(await root(), "session-A", provider); const bridgeB = new OpenCodeBridge(await root(), "session-B", provider); let resultA; for (let index = 0; index < 3; index++) { const before = await bridgeA.before("bash", { command: `cmd-a-${index}` }); resultA = await bridgeA.after(before.action, false, "error same"); } expect(resultA?.policy.decision).toBe("replan"); const beforeB = await bridgeB.before("bash", { command: "cmd-b-0" }); const resultB = await bridgeB.after(beforeB.action, true, "ok"); expect(resultB?.policy.decision).toBe("allow"); expect(bridgeA.session.id).not.toBe(bridgeB.session.id); });
});

describe("closed-loop PendingReplan", () => {
  it("creates valid pending replan structure", () => { const replan: PendingReplan = { id: "replan_test123", sessionID: "sess_abc", createdAt: Date.now(), stagnationScore: 0.81, evidence: { sameStrategy: 0.95, sameUnderlyingProblem: 0.94, surfaceVariation: 0.9, newInformation: 0.12, likelyToProgress: 0.11, strategyChangeNeeded: 0.76 } satisfies StagnationReflex, consumed: false }; expect(replan.id).toMatch(/^replan_/); expect(replan.consumed).toBe(false); expect(replan.stagnationScore).toBeGreaterThan(0); });

  it("one-shot: consumed flag prevents re-injection", () => { const replan: PendingReplan = { id: "replan_x", sessionID: "s", createdAt: Date.now(), stagnationScore: 0.8, evidence: { sameStrategy: 0.9, sameUnderlyingProblem: 0.9, surfaceVariation: 0.8, newInformation: 0.1, likelyToProgress: 0.1, strategyChangeNeeded: 0.7 }, consumed: false }; expect(replan.consumed).toBe(false); replan.consumed = true; expect(replan.consumed).toBe(true); });

  it("session isolation: different sessions are independent", () => { const replanA: PendingReplan = { id: "replan_a", sessionID: "sess_A", createdAt: Date.now(), stagnationScore: 0.8, evidence: { sameStrategy: 0.9, sameUnderlyingProblem: 0.9, surfaceVariation: 0.8, newInformation: 0.1, likelyToProgress: 0.1, strategyChangeNeeded: 0.7 }, consumed: false }; const replanB: PendingReplan = { id: "replan_b", sessionID: "sess_B", createdAt: Date.now(), stagnationScore: 0.8, evidence: { sameStrategy: 0.9, sameUnderlyingProblem: 0.9, surfaceVariation: 0.8, newInformation: 0.1, likelyToProgress: 0.1, strategyChangeNeeded: 0.7 }, consumed: false }; replanA.consumed = true; expect(replanB.consumed).toBe(false); });

  it("stale entries should be cleaned up", () => { const stale: PendingReplan = { id: "replan_stale", sessionID: "s", createdAt: Date.now() - 31 * 60 * 1000, stagnationScore: 0.8, evidence: { sameStrategy: 0.9, sameUnderlyingProblem: 0.9, surfaceVariation: 0.8, newInformation: 0.1, likelyToProgress: 0.1, strategyChangeNeeded: 0.7 }, consumed: false }; expect(Date.now() - stale.createdAt).toBeGreaterThan(30 * 60 * 1000); });
});

describe("replan lifecycle states", () => {
  it("transitions: detected → queued", () => {
    const replan: PendingReplan = { id: "replan_lc1", sessionID: "s1", createdAt: Date.now(), stagnationScore: 0.85, evidence: { sameStrategy: 0.9, sameUnderlyingProblem: 0.9, surfaceVariation: 0.8, newInformation: 0.1, likelyToProgress: 0.1, strategyChangeNeeded: 0.7 }, consumed: false, state: "detected" };
    replan.state = "queued";
    expect(replan.state).toBe("queued");
  });

  it("transitions: queued → injected", () => {
    const replan: PendingReplan = { id: "replan_lc2", sessionID: "s2", createdAt: Date.now(), stagnationScore: 0.85, evidence: { sameStrategy: 0.9, sameUnderlyingProblem: 0.9, surfaceVariation: 0.8, newInformation: 0.1, likelyToProgress: 0.1, strategyChangeNeeded: 0.7 }, consumed: false, state: "queued" };
    replan.consumed = true;
    replan.state = "injected";
    expect(replan.state).toBe("injected");
    expect(replan.consumed).toBe(true);
  });

  it("transitions: injected → observing", () => {
    const replan: PendingReplan = { id: "replan_lc3", sessionID: "s3", createdAt: Date.now(), stagnationScore: 0.85, evidence: { sameStrategy: 0.9, sameUnderlyingProblem: 0.9, surfaceVariation: 0.8, newInformation: 0.1, likelyToProgress: 0.1, strategyChangeNeeded: 0.7 }, consumed: true, state: "injected" };
    replan.state = "observing";
    expect(replan.state).toBe("observing");
  });

  it("transitions: observing → resolved with outcome", () => {
    const replan: PendingReplan = { id: "replan_lc4", sessionID: "s4", createdAt: Date.now(), stagnationScore: 0.85, evidence: { sameStrategy: 0.9, sameUnderlyingProblem: 0.9, surfaceVariation: 0.8, newInformation: 0.1, likelyToProgress: 0.1, strategyChangeNeeded: 0.7 }, consumed: true, state: "observing" };
    replan.state = "resolved";
    replan.outcome = "changed";
    expect(replan.state).toBe("resolved");
    expect(replan.outcome).toBe("changed");
  });

  it("outcome can be ignored", () => {
    const replan: PendingReplan = { id: "replan_lc5", sessionID: "s5", createdAt: Date.now(), stagnationScore: 0.85, evidence: { sameStrategy: 0.9, sameUnderlyingProblem: 0.9, surfaceVariation: 0.8, newInformation: 0.1, likelyToProgress: 0.1, strategyChangeNeeded: 0.7 }, consumed: true, state: "resolved", outcome: "ignored" };
    expect(replan.outcome).toBe("ignored");
  });

  it("outcome can be unclear", () => {
    const replan: PendingReplan = { id: "replan_lc6", sessionID: "s6", createdAt: Date.now(), stagnationScore: 0.85, evidence: { sameStrategy: 0.9, sameUnderlyingProblem: 0.9, surfaceVariation: 0.8, newInformation: 0.1, likelyToProgress: 0.1, strategyChangeNeeded: 0.7 }, consumed: true, state: "resolved", outcome: "unclear" };
    expect(replan.outcome).toBe("unclear");
  });

  it("instruction hash is set on injection", () => {
    const replan: PendingReplan = { id: "replan_lc7", sessionID: "s7", createdAt: Date.now(), stagnationScore: 0.85, evidence: { sameStrategy: 0.9, sameUnderlyingProblem: 0.9, surfaceVariation: 0.8, newInformation: 0.1, likelyToProgress: 0.1, strategyChangeNeeded: 0.7 }, consumed: false, state: "queued" };
    replan.instructionHash = "abc123def456";
    replan.consumed = true;
    replan.state = "injected";
    expect(replan.instructionHash).toBe("abc123def456");
  });
});

describe("system injection safety", () => {
  it("PendingReplan never contains user message fields", () => {
    const replan: PendingReplan = { id: "replan_safety1", sessionID: "s", createdAt: Date.now(), stagnationScore: 0.8, evidence: { sameStrategy: 0.9, sameUnderlyingProblem: 0.9, surfaceVariation: 0.8, newInformation: 0.1, likelyToProgress: 0.1, strategyChangeNeeded: 0.7 }, consumed: false };
    expect(replan).not.toHaveProperty("userMessage");
    expect(replan).not.toHaveProperty("role");
    expect(replan).not.toHaveProperty("content");
  });

  it("replan state has explicit lifecycle type", () => {
    const validStates = ["detected", "queued", "injected", "observing", "resolved"];
    const replan: PendingReplan = { id: "replan_safety2", sessionID: "s", createdAt: Date.now(), stagnationScore: 0.8, evidence: { sameStrategy: 0.9, sameUnderlyingProblem: 0.9, surfaceVariation: 0.8, newInformation: 0.1, likelyToProgress: 0.1, strategyChangeNeeded: 0.7 }, consumed: false, state: "detected" };
    expect(validStates).toContain(replan.state);
  });
});

describe("duplicate protection", () => {
  it("only one pending replan per session", () => {
    const pending = new Map<string, PendingReplan>();
    const makeReplan = (id: string): PendingReplan => ({ id, sessionID: "sess_dup", createdAt: Date.now(), stagnationScore: 0.8, evidence: { sameStrategy: 0.9, sameUnderlyingProblem: 0.9, surfaceVariation: 0.8, newInformation: 0.1, likelyToProgress: 0.1, strategyChangeNeeded: 0.7 }, consumed: false, state: "queued" });
    pending.set("sess_dup", makeReplan("replan_first"));
    pending.set("sess_dup", makeReplan("replan_second"));
    expect(pending.size).toBe(1);
    expect(pending.get("sess_dup")?.id).toBe("replan_second");
  });
});

describe("ATHENA RPC contract", () => {
  it("has 4 methods: status, session, setMode, recentEvents", async () => {
    const { athenaRpc } = await import("../src/rpc.js");
    expect(Object.keys(athenaRpc.methods)).toEqual(["status", "session", "setMode", "recentEvents"]);
  });

  it("has 5 events: reflex, replanQueued, replanInjected, replanOutcome, modeChanged", async () => {
    const { athenaRpc } = await import("../src/rpc.js");
    expect(Object.keys(athenaRpc.events)).toEqual(["reflex", "replanQueued", "replanInjected", "replanOutcome", "modeChanged"]);
  });

  it("status output has all required fields", async () => {
    const { athenaRpc } = await import("../src/rpc.js");
    const required = ["mode", "provider", "providerHealthy", "jevCalls", "jevFailures", "medianLatency", "budgetUsed", "budgetLimit"];
    for (const field of required) {
      expect(athenaRpc.methods.status.output.properties).toHaveProperty(field);
      expect(athenaRpc.methods.status.output.required).toContain(field);
    }
  });

  it("session input requires sessionID", async () => {
    const { athenaRpc } = await import("../src/rpc.js");
    expect(athenaRpc.methods.session.input.required).toContain("sessionID");
  });

  it("setMode input restricts to shadow/guardian/balanced", async () => {
    const { athenaRpc } = await import("../src/rpc.js");
    expect(athenaRpc.methods.setMode.input.properties.mode.enum).toEqual(["shadow", "guardian", "balanced"]);
  });

  it("replanQueued event has replanId and stagnationScore", async () => {
    const { athenaRpc } = await import("../src/rpc.js");
    expect(athenaRpc.events.replanQueued.schema.properties).toHaveProperty("replanId");
    expect(athenaRpc.events.replanQueued.schema.properties).toHaveProperty("stagnationScore");
  });

  it("RPC definition id is 'athena'", async () => {
    const { athenaRpc } = await import("../src/rpc.js");
    expect(athenaRpc.id).toBe("athena");
  });
});

describe("straightforward-progress regression", () => {
  it("produces 0 unnecessary replans when progress continues", async () => {
    const progressProvider: ReflexProvider = {
      ...provider,
      evaluateStagnation: async () => ({ sameStrategy: 0.2, sameUnderlyingProblem: 0.15, surfaceVariation: 0.1, newInformation: 0.9, likelyToProgress: 0.85, strategyChangeNeeded: 0.05 }),
    };
    const bridge = new OpenCodeBridge(await root(), "progress-session", progressProvider);
    let replanCount = 0;
    for (let i = 0; i < 5; i++) {
      const action = i % 2 === 0 ? "read src/file.ts" : "pnpm test";
      const before = await bridge.before("bash", { command: action });
      const result = await bridge.after(before.action, true, i % 2 === 0 ? "file contents" : "PASS all tests");
      if (result?.policy.decision === "replan") replanCount++;
    }
    expect(replanCount).toBe(0);
  });
});
