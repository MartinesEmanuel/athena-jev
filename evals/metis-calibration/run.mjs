import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { URL } from "node:url";
import { createSession, stateFor, strategyFamily } from "../../packages/core/dist/index.js";
import { TypeSafeClient, noul } from "../../packages/typesafe/node_modules/@typesafe-ai/sdk/dist/index.mjs";

const directory = new URL(".", import.meta.url);
const cases = JSON.parse(await readFile(new URL("cases.json", directory), "utf8"));
const client = new TypeSafeClient({ timeout: 4000 });
const variants = {
  v1: { sameStrategy: "Do recent actions represent same strategy despite syntax changes?", newInformation: "Did recent results provide meaningful new information?", likelyToProgress: "Is repeating current strategy likely to progress?", strategyChangeNeeded: "Should agent change strategy now?" },
  v2: { sameStrategy: "Do recent actions pursue essentially same underlying strategy?", sameUnderlyingProblem: "Is same underlying failure unresolved across recent attempts?", surfaceVariation: "Are recent actions mostly superficial variations of earlier attempts?", newInformation: "Have recent results produced materially new information?", likelyToProgress: "Is continuing current strategy likely to produce progress?", strategyChangeNeeded: "Would changing strategy be advisable now?" }
};
function stateForCase(item) { const session = createSession(item.goal); for (let index = 0; index < item.actions.length; index++) { const action = { id: `${index}`, tool: "bash", input: item.actions[index], timestamp: "2026-09-18T00:00:00.000Z" }; session.actions.push(action); session.results.push({ actionId: action.id, success: /completed|started|pass|fixed|changed|added|implemented|removed|stopped|built/i.test(item.results[index]), output: item.results[index], timestamp: action.timestamp }); } return stateFor(session, session.actions.at(-1), session.results.at(-1)); }
function score(value) { return 0.25 * value.sameStrategy + 0.2 * value.sameUnderlyingProblem + 0.15 * value.surfaceVariation + 0.2 * (1 - value.newInformation) + 0.1 * (1 - value.likelyToProgress) + 0.1 * value.strategyChangeNeeded; }
function metrics(rows, threshold) { let tp = 0; let tn = 0; let fp = 0; let fn = 0; for (const row of rows) { const prediction = row.score >= threshold && row.scores.newInformation <= 0.45; if (row.label === "loop") { if (prediction) tp++; else fn++; } else if (prediction) fp++; else tn++; } const precision = tp + fp ? tp / (tp + fp) : 0; const recall = tp / (tp + fn); const specificity = tn / (tn + fp); return { threshold, tp, tn, fp, fn, precision, recall, specificity, f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0 }; }
const raw = [];
for (const item of cases) for (const [variant, questions] of Object.entries(variants)) { const started = performance.now(); const response = await client.systemOne({ state: JSON.stringify({ kind: "athena-metis-calibration", state: stateForCase(item) }), questions: Object.fromEntries(Object.entries(questions).map(([key, question]) => [key, noul(question)])) }); const scores = Object.fromEntries(Object.entries(response.answers).map(([key, answer]) => [key, answer.noul])); raw.push({ caseId: item.id, label: item.label, variant, latencyMs: Math.round(performance.now() - started), scores, score: variant === "v2" ? score(scores) : undefined, strategyFamilies: item.actions.map((input) => strategyFamily({ id: input, tool: "bash", input, timestamp: "now" })) }); }
const selected = raw.filter((row) => row.variant === "v2");
const thresholds = Array.from({ length: 10 }, (_, index) => metrics(selected, 0.5 + index * 0.05));
const recommended = thresholds.filter((row) => row.fp === 0 && row.recall >= 0.9).at(-1) ?? thresholds.at(-1);
const breakdown = { loops: selected.filter((row) => row.label === "loop").length, progress: selected.filter((row) => row.label === "progress").length, true_positive: recommended.tp, true_negative: recommended.tn, false_positive: recommended.fp, false_negative: recommended.fn, ambiguous: 0, not_applicable: 0, provider_error: 0, evaluation_error: 0 };
const timestamp = new Date().toISOString();
await writeFile(new URL("raw-jev-results.json", directory), `${JSON.stringify({ timestamp, provider: "typesafe", variants, rows: raw }, null, 2)}\n`);
await writeFile(new URL("threshold-report.json", directory), `${JSON.stringify({ timestamp, rows: thresholds, recommended }, null, 2)}\n`);
await writeFile(new URL("question-variant-report.json", directory), `${JSON.stringify({ timestamp, variants: Object.fromEntries(Object.entries(variants).map(([key, value]) => [key, { questionCount: Object.keys(value).length, medianLatencyMs: raw.filter((row) => row.variant === key).map((row) => row.latencyMs).sort((a, b) => a - b)[19] }])), selectedVariant: "v2", reason: "v2 separates strategy, unresolved problem, surface variation, and new evidence into atomic questions." }, null, 2)}\n`);
await writeFile(new URL("final-calibration.json", directory), `${JSON.stringify({ timestamp, provider: "typesafe", cases: cases.length, breakdown, recommended, policy: "composite score with low-new-information guard and four independent signals" }, null, 2)}\n`);
process.stdout.write("METIS Calibration\n");
process.stdout.write(`Cases: loops ${breakdown.loops}, progress ${breakdown.progress}\n`);
process.stdout.write(`TP ${breakdown.true_positive} TN ${breakdown.true_negative} FP ${breakdown.false_positive} FN ${breakdown.false_negative}\n`);
for (const row of thresholds) process.stdout.write(`${row.threshold.toFixed(2)} precision=${row.precision.toFixed(2)} recall=${row.recall.toFixed(2)} fpr=${(1 - row.specificity).toFixed(2)} f1=${row.f1.toFixed(2)}\n`);
process.stdout.write(`Recommended threshold: ${recommended.threshold.toFixed(2)}\n`);
