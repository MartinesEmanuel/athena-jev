/* global process */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const experimentId = process.argv.slice(2).find((argument) => argument !== "--");
if (!experimentId) throw new Error("Usage: pnpm bench:report -- <experiment-id>");
const directory = join(root, "bench", "results", experimentId);
const summary = JSON.parse(await readFile(join(directory, "summary.json"), "utf8"));
const line = (label, value) => `- ${label}: ${value ?? "not reported"}`;
const section = (name, data) => [`## ${name}`, line("n", data.n), line("success rate", data.successRate), line("median time to solution", data.medianTimeToSolutionMs), line("median tool calls", data.medianToolCalls), line("median LLM turns", data.medianLlmTurns), line("median failed tool calls", data.medianFailedToolCalls), line("REPLAN count", data.replanCount), line("reflex completed", data.reflexCompleted), line("Jev calls", data.jevCalls)].join("\n");
const report = ["# ATHENA BENCH", "", "> SMOKE TEST ONLY - NOT A PERFORMANCE CLAIM.", "", line("experiment", summary.experimentId), line("planned pairs", summary.plannedPairs), line("valid pairs", summary.validPairs.length), line("invalid pairs", summary.invalidPairs.length), "", section("CONTROL", summary.control), "", section("ATHENA", summary.treatment), "", "## INVALID PAIRS", ...summary.invalidPairs.map((pair) => `${pair.pairId}: ${pair.invalidReasons.join("; ")}`), "", "## INVALID REASONS", ...Object.entries(summary.invalidReasons ?? {}).map(([reason, count]) => `${reason}: ${count}`), "", "## ARTIFACT VALIDATION ERRORS", ...(summary.artifactValidationErrors ?? []).map((error) => `${error.runId}: ${error.reason}`), "", "## DELTA", ...summary.validPairs.map((pair) => `${pair.pairId}: ${JSON.stringify(pair.treatmentMinusControl)}`), ""].join("\n");
await writeFile(join(directory, "report.md"), report);
process.stdout.write(report);
