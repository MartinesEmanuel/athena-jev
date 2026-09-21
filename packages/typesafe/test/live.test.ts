import { describe, expect, it } from "vitest";
import { TypeSafeReflexProvider, createTypeSafeSystem1 } from "../src/index.js";
import { buildCognitiveWorldState, createSession, stateFor } from "@athena/core";

const enabled = process.env.ATHENA_LIVE_TEST === "1" && Boolean(process.env.TYPESAFE_API_KEY);
describe.runIf(enabled)("live TypeSafe Jev", () => {
  it("validates minimal System One response", async () => { const provider = new TypeSafeReflexProvider(8000); const session = createSession("Read package configuration"); const action = { id: "live", tool: "read", input: "package.json", readOnly: true, timestamp: new Date().toISOString() }; const started = performance.now(); const risk = await provider.evaluateRisk(stateFor(session, action)); expect(risk.relevance).toBeGreaterThanOrEqual(0); expect(risk.relevance).toBeLessThanOrEqual(1); process.stdout.write(`ATHENA live Jev validation latency: ${Math.round(performance.now() - started)}ms\n`); });
  it("produces a Phase 6 System-1 snapshot", async () => { const runtime = createTypeSafeSystem1(8000); const snapshot = await runtime.assess(buildCognitiveWorldState({ goal: { goalId: "live", description: "Inspect package configuration" }, candidate: { id: "live", kind: "tool", tool: "read", intent: "inspect package configuration" }, recentActions: [], recentStrategies: [], unresolvedObligations: [], environment: { workingMode: "live", availableCapabilities: ["read"], relevantConstraints: [] } })); expect(snapshot.assessment.progress.progressProbability).toBeGreaterThanOrEqual(0); expect(snapshot.assessment.progress.progressProbability).toBeLessThanOrEqual(1); });
});
