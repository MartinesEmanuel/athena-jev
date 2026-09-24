/* global process, console */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { doctor, loadConfig, manifest, plan, stratifiedSelect, tasks } from "./lib.mjs";
const [command, ...args] = process.argv.slice(2); const dry = args.includes("--dry-run"); const live = args.includes("--confirm-live");
const root = process.env.SWE_BENCH_PRO_V2_ROOT && resolve(process.env.SWE_BENCH_PRO_V2_ROOT);
const name = command === "final" ? "final" : "pilot"; const config = await loadConfig(name);
if (command === "doctor") { console.log(JSON.stringify(await doctor(root, config), null, 2)); process.exit(0); }
if (!root) throw Error("SWE_BENCH_PRO_V2_ROOT must point to the official pinned checkout");
const all = await tasks(root); if (all.length !== config.dataset.expectedTasks) throw Error(`official V2 task count mismatch: expected ${config.dataset.expectedTasks}, got ${all.length}`);
const selected = stratifiedSelect(all, config.tasks, config.benchmarkSeed); const trajectories = plan(config, selected);
const workload = { tasks: selected.length, conditions: config.conditions, runsPerTask: config.runsPerTask, totalTrajectories: trajectories.length, workers: config.workers, timeoutSeconds: config.timeoutSeconds, model: config.model, benchmark: config.dataset };
if (dry) { console.log(JSON.stringify({ dryRun: true, workload, taskIds: selected.map(x=>x.id), conditionOrder: trajectories.map(x=>[x.taskId,x.condition]) }, null, 2)); process.exit(0); }
if (!live) throw Error("Live benchmark requires --confirm-live; dry-run never makes model calls.");
if (Object.values(config.model).includes("REQUIRED") || config.networkPolicy.allowedHost === "REQUIRED_MODEL_ENDPOINT") throw Error("freeze model/provider/reasoning effort/model host before live execution");
const d = await doctor(root, config); if (!d.checks.safeFullRun || !d.officialGrader) throw Error("STOP: resources or official pristine grader unavailable; do not improvise.");
const runId = `sbp-v2-${new Date().toISOString().replace(/[:.]/g,"-")}`; const runDir = join(resolve("benchmarks/swebench-pro-v2/runs"), runId); await mkdir(runDir,{recursive:true}); await writeFile(join(runDir,"manifest.json"),JSON.stringify(await manifest(config,selected),null,2));
console.log(JSON.stringify({ runId, workload, status: "prepared", next: "Use the documented Harbor locked OpenCode agent and patch replay commands; no model run is launched by this safety gate." },null,2));
