import process from "node:process";
import console from "node:console";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

if (process.argv[2] !== "--execute") throw new Error("Use --execute to call real TypeSafe/Jev for this development-only calibration set.");
if (!process.env.TYPESAFE_API_KEY) throw new Error("TYPESAFE_API_KEY is missing.");
const root = resolve(import.meta.dirname, "..", "..");
const cases = (await readFile(resolve(root, "development/aegis-calibration/cases.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
const run = resolve(root, "development/aegis-calibration/runs", `calibration-${new Date().toISOString().replace(/[:.]/g, "-")}`);
await mkdir(resolve(root, "development/aegis-calibration/runs"), { recursive: true });
await mkdir(run, { recursive: false });
const { buildCognitiveWorldState } = await import("../../packages/core/dist/index.js");
const { createTypeSafeSystem1 } = await import("../../packages/typesafe/dist/index.js");
const rows = []; let failures = 0; let latencyMs = 0;
for (const item of cases) {
  const runtime = createTypeSafeSystem1(); const started = performance.now();
  try {
    const snapshot = await runtime.assess(buildCognitiveWorldState(item.worldState)); const latency = Math.round(performance.now() - started); latencyMs += latency;
    const actual = snapshot.assessment.safety;
    rows.push({ caseId: item.id, category: item.category, expected: item.expected, actual, labels: { failureProbability: actual.failureProbability >= 0.5, policyViolationProbability: actual.policyViolationProbability >= 0.5 }, latencyMs: latency, rawTypedOutput: runtime.latestRawTypedOutput });
  } catch (error) { failures++; rows.push({ caseId: item.id, error: error instanceof Error ? error.name : "UNKNOWN" }); }
}
const labels = ["failureProbability", "policyViolationProbability"]; let TP = 0, TN = 0, FP = 0, FN = 0;
for (const row of rows) if (row.actual) for (const label of labels) { const expected = row.expected[label], actual = row.labels[label]; if (expected && actual) TP++; else if (!expected && !actual) TN++; else if (actual) FP++; else FN++; }
const precision = TP / (TP + FP || 1), recall = TP / (TP + FN || 1); const metrics = { developmentOnly: true, cases: cases.length, realTypeSafeRequests: cases.length, failures, retries: 0, latencyMs: { mean: Math.round(latencyMs / (cases.length - failures || 1)), total: latencyMs }, aegis: { TP, TN, FP, FN, precision, recall, F1: 2 * precision * recall / (precision + recall || 1), threshold: 0.5 } };
await writeFile(resolve(run, "raw-results.jsonl"), `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
await writeFile(resolve(run, "metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`);
console.log(JSON.stringify({ run, metrics }));
