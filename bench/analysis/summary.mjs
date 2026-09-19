/* global process */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { validatePair, validateResultForAnalysis } from "../runners/index.mjs";

export function median(values) { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; }
export function analyzeRuns(runs, plan) {
  const artifactValidationErrors = [];
  const validArtifacts = runs.filter((run) => { try { validateResultForAnalysis(run); return true; } catch (error) { artifactValidationErrors.push({ runId: run?.runId ?? null, reason: error.message }); return false; } });
  const validByRunId = new Set(validArtifacts.map((run) => run.runId));
  const pairs = [...new Set(validArtifacts.map((run) => run.pairId))].map((pairId) => { const pairRuns = validArtifacts.filter((run) => run.pairId === pairId); const validity = validatePair(pairRuns); const control = pairRuns.find((run) => run.arm === "control"); const treatment = pairRuns.find((run) => run.arm === "treatment"); return { pairId, ...validity, treatmentMinusControl: control && treatment ? { durationMs: treatment.durationMs - control.durationMs, toolCalls: treatment.metrics.toolCalls - control.metrics.toolCalls, failedToolCalls: treatment.metrics.failedToolCalls - control.metrics.failedToolCalls, tokensDelta: typeof treatment.metrics.hostTokens?.total === "number" && typeof control.metrics.hostTokens?.total === "number" ? treatment.metrics.hostTokens.total - control.metrics.hostTokens.total : null } : null }; });
  const validPairIds = new Set(pairs.filter((pair) => pair.pairValid).map((pair) => pair.pairId));
  const summarize = (arm) => { const selected = validArtifacts.filter((run) => run.arm === arm && validPairIds.has(run.pairId)); const number = (key) => selected.map((run) => run.metrics[key]).filter((value) => typeof value === "number"); return { n: selected.length, successRate: selected.length ? selected.filter((run) => run.metrics.taskSuccess).length / selected.length : null, medianTimeToSolutionMs: median(number("timeToSolutionMs")), medianToolCalls: median(number("toolCalls")), medianLlmTurns: median(number("llmTurns")), medianFailedToolCalls: median(number("failedToolCalls")), replanCount: selected.reduce((sum, run) => sum + run.athenaTelemetrySummary.replan, 0), reflexCompleted: selected.reduce((sum, run) => sum + run.athenaTelemetrySummary.reflexCompleted, 0), jevCalls: selected.some((run) => typeof run.athenaTelemetrySummary.jevCalls === "number") ? selected.reduce((sum, run) => sum + (run.athenaTelemetrySummary.jevCalls ?? 0), 0) : null }; };
  const invalidPairs = pairs.filter((pair) => !pair.pairValid);
  const invalidReasons = Object.fromEntries(invalidPairs.flatMap((pair) => pair.invalidReasons).sort().reduce((counts, reason) => counts.set(reason, (counts.get(reason) ?? 0) + 1), new Map()));
  const manifestPairs = plan?.pairs ?? [];
  const plannedPairs = manifestPairs.length;
  const missingPairs = manifestPairs.filter((manifestPair) => !pairs.some((p) => p.pairId === manifestPair.pairId)).map((manifestPair) => {
    const missingArms = manifestPair.runs.filter((r) => !validByRunId.has(r.runId)).map((r) => r.arm);
    return { pairId: manifestPair.pairId, reason: missingArms.length === manifestPair.runs.length ? `missing all results: ${missingArms.join(", ")}` : `missing ${missingArms.join(" result, ")} result` };
  });
  const incompletePairs = pairs.filter((pair) => !pair.pairValid && pair.invalidReasons.some((r) => r.startsWith("missing"))).map((pair) => ({ pairId: pair.pairId, reason: pair.invalidReasons.join("; ") }));
  return { smokeTestOnly: true, plannedPairs, validPairs: pairs.filter((pair) => pair.pairValid), invalidPairs, invalidReasons, artifactValidationErrors, missingPairs, incompletePairs, control: summarize("control"), treatment: summarize("treatment"), pairs };
}
function csvCell(value) { const text = value === null || value === undefined ? "" : String(value); return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text; }
export function summaryCsv(runs, analysis) {
  const invalidArtifact = new Map(analysis.artifactValidationErrors.map((error) => [error.runId, error.reason]));
  const pairValidity = new Map(analysis.pairs.map((pair) => [pair.pairId, pair]));
  const header = ["pair_id", "arm", "artifact_valid", "pair_valid", "invalid_reason", "success", "duration_ms", "tool_calls", "llm_turns", "failed_tool_calls", "replans", "reflex_completed"];
  const rows = runs.map((run) => {
    const artifactValid = !invalidArtifact.has(run?.runId ?? null); const pair = pairValidity.get(run?.pairId); const metrics = artifactValid ? run.metrics : {}; const telemetry = artifactValid ? run.athenaTelemetrySummary : {};
    return [run?.pairId, run?.arm, artifactValid, pair?.pairValid ?? false, invalidArtifact.get(run?.runId ?? null) ?? pair?.invalidReasons?.join("; ") ?? "", metrics?.taskSuccess, run?.durationMs, metrics?.toolCalls, metrics?.llmTurns, metrics?.failedToolCalls, telemetry?.replan, telemetry?.reflexCompleted].map(csvCell).join(",");
  });
  return [header.join(","), ...rows].join("\n") + "\n";
}

const experimentId = process.argv.slice(2).find((argument) => argument !== "--");
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { if (!experimentId) throw new Error("Usage: pnpm bench:analyze -- <experiment-id>"); const directory = join(process.cwd(), "bench", "results", experimentId); const manifest = await readFile(join(directory, "manifest.json"), "utf8").then(JSON.parse).catch(() => null); const runs = await Promise.all((await readdir(join(directory, "runs"))).filter((name) => name.endsWith(".json")).map(async (name) => JSON.parse(await readFile(join(directory, "runs", name), "utf8")))); const summary = { experimentId, ...analyzeRuns(runs, manifest) }; await writeFile(join(directory, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`); await writeFile(join(directory, "summary.csv"), summaryCsv(runs, summary)); process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`); }
