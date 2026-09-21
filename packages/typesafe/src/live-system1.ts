import { CognitivePolicy, buildCognitiveWorldState, initialCognitiveState } from "@athena/core";
import { createTypeSafeSystem1 } from "./index.js";

const scenarios = [
  ["healthy-progress", "inspect implementation", "SUCCESS", "read source", "inspect source"],
  ["semantic-stagnation", "inspect repeated failure", "FAILURE", "run failing test", "rerun failing test"],
  ["premature-completion", "confirm completion claim", "UNKNOWN", "review evidence", "review completion evidence"],
  ["insufficient-context", "collect initial evidence", "UNKNOWN", "read configuration", "inspect configuration"],
  ["irreversible-risk", "inspect destructive proposal", "UNKNOWN", "review command", "review destructive command"],
] as const;

const runtime = createTypeSafeSystem1();
const policy = new CognitivePolicy();
for (const [name, intent, outcome, actionIntent, approach] of scenarios) {
  const world = buildCognitiveWorldState({ goal: { goalId: name, description: "Resolve explicit engineering task" }, candidate: { id: name, kind: "tool", tool: "read", intent }, currentObservation: { source: "synthetic", summary: actionIntent, outcome }, recentActions: [{ candidateId: `${name}-previous`, kind: "tool", intent: actionIntent, outcome }], recentStrategies: [{ strategyId: `${name}-strategy`, intent: actionIntent, approach }], unresolvedObligations: [], environment: { workingMode: "live-smoke", availableCapabilities: ["read"], relevantConstraints: ["synthetic world only"] } });
  const snapshot = await runtime.assess(world);
  const decision = policy.evaluate(snapshot.assessment, initialCognitiveState(), snapshot.worldState);
  process.stdout.write(`${JSON.stringify({ scenario: name, assessment: snapshot.assessment, decision: decision.decision, reasons: decision.reasons })}\n`);
}
