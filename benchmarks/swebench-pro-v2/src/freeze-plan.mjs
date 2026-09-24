/* global console, process */
/* Generate condition-blind, metadata-only task selection before any trajectory runs. */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadConfig, plan, sha256, stratifiedSelect, tasks } from "./lib.mjs";

const [datasetRoot, output = "benchmarks/swebench-pro-v2"] = process.argv.slice(2);
if (!datasetRoot) throw Error("usage: freeze-plan.mjs <official-pinned-dataset-root> [output-directory]");
const config = await loadConfig("pilot");
const all = await tasks(resolve(datasetRoot));
if (all.length !== config.dataset.expectedTasks) throw Error(`expected ${config.dataset.expectedTasks} official tasks; found ${all.length}`);
const selected = stratifiedSelect(all, config.tasks, config.benchmarkSeed);
const candidate = {
  schemaVersion: "1.0.0",
  datasetCommit: config.dataset.commit,
  selection: "condition-blind stratified by repository parsed from official task directory metadata",
  seed: config.benchmarkSeed,
  expectedDatasetTasks: config.dataset.expectedTasks,
  tasks: selected.map(({ id, repository }) => ({ taskId: id, repository })),
};
const randomization = {
  schemaVersion: "1.0.0",
  seed: config.benchmarkSeed,
  algorithm: "SHA-256 task-id/run-index seeded Fisher-Yates condition ordering",
  trajectories: plan(config, selected),
};
await mkdir(resolve(output), { recursive: true });
const candidateText = `${JSON.stringify(candidate, null, 2)}\n`;
await writeFile(resolve(output, "candidate-tasks.json"), candidateText);
await writeFile(resolve(output, "candidate-tasks.sha256"), `${sha256(candidateText)}  candidate-tasks.json\n`);
await writeFile(resolve(output, "randomization.json"), `${JSON.stringify(randomization, null, 2)}\n`);
console.log(JSON.stringify({ taskCount: selected.length, candidateSha256: sha256(candidateText), output: resolve(output) }, null, 2));
