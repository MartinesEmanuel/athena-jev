import { describe, expect, it } from "vitest";
import { actionCategory, configSchema, createSession, decide, extractErrors, hardRule, isMeaningful, normalizeText, redact, stagnationEligible, stateFor, strategyFamily } from "../src/index.js";

const action = (input: string, readOnly = false) => ({ id: input, tool: readOnly ? "read" : "bash", input, readOnly, timestamp: "2026-01-01T00:00:00.000Z" });
describe("config and safety hardening", () => {
  it("defaults budgets", () => expect(configSchema.parse({}).budgets.maxJevCallsPerSession).toBe(100));
  it("rejects invalid threshold", () => expect(() => configSchema.parse({ thresholds: { riskAsk: 2 } })).toThrow());
  it("rejects invalid budget", () => expect(() => configSchema.parse({ budgets: { minMeaningfulActionsBetweenStagnationChecks: 0 } })).toThrow());
  it("allows normal read", () => expect(hardRule(action("package.json", true))).toBeUndefined());
  it("tags root deletion", () => expect(hardRule(action("rm -rf /"))?.id).toBe("FS_ROOT_RECURSIVE_DELETE"));
  it("tags database deletion", () => expect(hardRule(action("DROP TABLE users;"))?.id).toBe("DB_DESTRUCTIVE"));
  it("tags environment reads", () => expect(hardRule(action(".env", true))?.id).toBe("SECRET_ENV_READ"));
  it("normalizes ansi and whitespace", () => expect(normalizeText("\u001b[31m error  here \n")).toBe("error here"));
  it("redacts token forms", () => expect(redact("token=abc Bearer abc.def")).toContain("[REDACTED]"));
  it("extracts bounded errors", () => expect(extractErrors("Error: broken. normal. conflict found.")).toHaveLength(2));
  it("groups install variants by strategy", () => expect(strategyFamily(action("pnpm install --force"))).toBe(strategyFamily(action("pnpm install --legacy-peer-deps"))));
  it("filters read-only noise", () => expect(isMeaningful(action("package.json", true))).toBe(false));
  it("categorizes package commands", () => expect(actionCategory(action("pnpm install"))).toBe("package-management"));
  it("blocks only in intervention modes", () => expect(decide(configSchema.parse({ mode: "shadow" }), { action: action("rm -rf /") }).shadow).toBe(true));
  it("does not evaluate short history", () => { const session = createSession("goal"); session.meaningfulActions = 2; expect(stagnationEligible(session, configSchema.parse({}))).toBe(false); });
  it("respects stagnation interval", () => { const session = createSession("goal"); session.meaningfulActions = 3; expect(stagnationEligible(session, configSchema.parse({}))).toBe(false); session.meaningfulActions = 4; expect(stagnationEligible(session, configSchema.parse({}))).toBe(true); });
  it("respects replan cooldown", () => { const session = createSession("goal"); session.meaningfulActions = 4; session.lastReplanMeaningfulAction = 3; expect(stagnationEligible(session, configSchema.parse({}))).toBe(false); });
  it("builds bounded structured state", () => { const session = createSession("goal"); for (let index = 0; index < 10; index++) session.actions.push(action(`pnpm install --flag-${index}`)); expect(stateFor(session).recentActions).toHaveLength(8); });
});
