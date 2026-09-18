import { describe, expect, it } from "vitest";
import { DemoReflexProvider, TypeSafeReflexProvider } from "../src/index.js";
import { createSession, stateFor } from "@athena/core";
describe("providers", () => {
  it("detects demo semantic installation loop", async () => { const session = createSession("install"); for (const input of ["pnpm install", "pnpm install --force", "pnpm install --legacy-peer-deps"]) session.actions.push({ id: input, tool: "bash", input, timestamp: "now" }); expect((await new DemoReflexProvider().evaluateStagnation(stateFor(session))).sameStrategy).toBeGreaterThan(0.9); });
  it("requires key for real provider", () => { const previous = process.env.TYPESAFE_API_KEY; delete process.env.TYPESAFE_API_KEY; expect(() => new TypeSafeReflexProvider()).toThrow(/missing/); if (previous) process.env.TYPESAFE_API_KEY = previous; });
});
