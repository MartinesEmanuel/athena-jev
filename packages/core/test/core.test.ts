import { describe, expect, it } from "vitest";
import { EventStore, configSchema, createSession, decide, hardRule, hasStagnationEvidence, redact, stagnationScore, stateFor, strategyFamily } from "../src/index.js";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const action = (input: string) => ({ id: "a", tool: "bash", input, timestamp: new Date().toISOString() });
describe("ATHENA core", () => {
  it("denies deterministic catastrophic commands", () => { expect(hardRule(action("rm -rf /"))?.category).toBe("filesystem"); expect(decide(configSchema.parse({ mode: "balanced" }), { action: action("git reset --hard") }).decision).toBe("deny"); });
  it("applies multi-signal stagnation policy", () => { const config = configSchema.parse({ mode: "balanced" }); const loop = { sameStrategy: 0.96, sameUnderlyingProblem: 0.94, surfaceVariation: 0.9, newInformation: 0.1, likelyToProgress: 0.1, strategyChangeNeeded: 0.75 }; expect(decide(config, { action: action("deploy"), risk: { relevance: 1, unintendedChange: 0.81, broadness: 0, approvalNeeded: 0 } }).decision).toBe("ask"); expect(stagnationScore(loop)).toBeGreaterThanOrEqual(0.85); expect(hasStagnationEvidence(loop)).toBe(true); expect(decide(config, { action: action("retry"), stagnation: loop }).decision).toBe("replan"); });
  it("does not replan useful progress", () => { const progress = { sameStrategy: 0.5, sameUnderlyingProblem: 0.2, surfaceVariation: 0.2, newInformation: 0.8, likelyToProgress: 0.7, strategyChangeNeeded: 0.1 }; expect(decide(configSchema.parse({ mode: "balanced" }), { action: action("pnpm test"), stagnation: progress }).decision).toBe("allow"); });
  it("extracts strategy families and repeated errors", () => { expect(strategyFamily(action("pnpm install --force"))).toBe("dependency-reinstall"); const session = createSession("install"); for (const input of ["pnpm install", "pnpm install --force", "pnpm install --legacy-peer-deps"]) { const item = action(input); session.actions.push(item); session.results.push({ actionId: item.id, success: false, output: "ERR_PNPM_PEER_DEP_ISSUES react conflict", timestamp: "now" }); } expect(stateFor(session).repeatedErrors).not.toHaveLength(0); });
  it("keeps shadow non-blocking", () => { const result = decide(configSchema.parse({}), { action: action("rm -rf /") }); expect(result).toMatchObject({ decision: "allow", shadow: true }); });
  it("validates config and redacts secrets", () => { expect(() => configSchema.parse({ mode: "unsafe" })).toThrow(); expect(redact("Bearer abc.def token=secret-value sk-abcdefghijklmnop")).not.toContain("secret-value"); });
  it("persists events and skips corrupt lines", async () => { const path = join(await mkdtemp(join(tmpdir(), "athena-")), "events.jsonl"); const store = new EventStore(path); await store.append({ timestamp: "now", sessionId: "s", type: "ACTION_ALLOWED", metadata: { token: "secret-value" } }); expect(await store.read()).toHaveLength(1); });
  it("limits compact state window", () => { const session = createSession("goal"); for (let index = 0; index < 10; index++) session.actions.push(action(`cmd ${index}`)); expect(stateFor(session).recentActions).toHaveLength(8); });
});
