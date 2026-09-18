import { describe, expect, it } from "vitest";
import { TypeSafeReflexProvider } from "../src/index.js";
import { createSession, stateFor } from "@athena/core";

const enabled = process.env.ATHENA_LIVE_TEST === "1" && Boolean(process.env.TYPESAFE_API_KEY);
describe.runIf(enabled)("live TypeSafe Jev", () => {
  it("validates minimal System One response", async () => { const provider = new TypeSafeReflexProvider(8000); const session = createSession("Read package configuration"); const action = { id: "live", tool: "read", input: "package.json", readOnly: true, timestamp: new Date().toISOString() }; const started = performance.now(); const risk = await provider.evaluateRisk(stateFor(session, action)); expect(risk.relevance).toBeGreaterThanOrEqual(0); expect(risk.relevance).toBeLessThanOrEqual(1); process.stdout.write(`ATHENA live Jev validation latency: ${Math.round(performance.now() - started)}ms\n`); });
});
