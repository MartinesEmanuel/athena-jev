/* global process */
import { loadCase, planExperiment, runPair } from "./index.mjs";

function options(args) { const output = {}; for (let index = 0; index < args.length; index++) { if (!args[index].startsWith("--")) continue; const key = args[index].slice(2); const next = args[index + 1]; output[key] = !next || next.startsWith("--") ? true : args[++index]; } return output; }
const [command, ...args] = process.argv.slice(2); const flags = options(args); const caseId = flags.case;
if (command !== "pair" || !caseId) throw new Error("Usage: pnpm bench:pair --case <case> [--replicates 1] [--seed 1] [--timeout 300000] [--model openai/gpt-5.6-terra] [--dry-run] [--confirm-live]");
const replicatesRaw = Number(flags.replicates ?? 1);
const seedRaw = Number(flags.seed ?? 1);
const timeoutRaw = flags.timeout ? Number(flags.timeout) : undefined;
const modelRaw = flags.model ?? "openai/gpt-5.6-terra";
if (!Number.isInteger(replicatesRaw) || replicatesRaw < 1) throw new Error("replicates must be a positive integer");
if (!Number.isInteger(seedRaw)) throw new Error("seed must be an integer");
if (timeoutRaw !== undefined && (!Number.isInteger(timeoutRaw) || timeoutRaw < 1000)) throw new Error("timeout must be an integer >= 1000");
if (typeof modelRaw !== "string" || !modelRaw) throw new Error("model must be a non-empty string");
const replicates = replicatesRaw; const caseDefinition = await loadCase(caseId); const experimentId = flags["experiment-id"] ?? `bench-${new Date().toISOString().replace(/[:.]/g, "-")}`; const plan = planExperiment({ caseDefinition, replicates, seed: seedRaw, model: modelRaw, timeoutMs: timeoutRaw ?? caseDefinition.timeoutMs, experimentId });
process.stdout.write(`${JSON.stringify({ runPlan: plan }, null, 2)}\n`);
const isDryRun = flags["dry-run"] === true;
const isConfirmLive = flags["confirm-live"] === true;
if (!isDryRun && !isConfirmLive) throw new Error("Live benchmark requires --confirm-live. Use --dry-run for harness validation.");
const results = []; for (let replicate = 1; replicate <= replicates; replicate++) results.push(await runPair({ caseId, replicate, seed: plan.seed, timeoutMs: plan.timeoutMs, model: plan.model, dryRun: isDryRun, preserve: Boolean(flags.preserve), experimentPlan: plan, confirmLive: isConfirmLive }));
process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
