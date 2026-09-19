/* global process */
import { loadCase, planExperiment, runPair } from "./index.mjs";

function options(args) { const output = {}; for (let index = 0; index < args.length; index++) { if (!args[index].startsWith("--")) continue; const key = args[index].slice(2); const next = args[index + 1]; output[key] = !next || next.startsWith("--") ? true : args[++index]; } return output; }
const [command, ...args] = process.argv.slice(2); const flags = options(args); const caseId = flags.case;
if (command !== "pair" || !caseId) throw new Error("Usage: pnpm bench:pair --case <case> [--replicates 1] [--seed 1] [--timeout 300000] [--model openai/gpt-5.6-terra] [--dry-run] [--confirm-live]");
const replicates = Number(flags.replicates ?? 1); const caseDefinition = await loadCase(caseId); const experimentId = flags["experiment-id"] ?? `bench-${new Date().toISOString().replace(/[:.]/g, "-")}`; const plan = planExperiment({ caseDefinition, replicates, seed: Number(flags.seed ?? 1), model: flags.model ?? "openai/gpt-5.6-terra", timeoutMs: flags.timeout ? Number(flags.timeout) : caseDefinition.timeoutMs, experimentId });
process.stdout.write(`${JSON.stringify({ runPlan: plan }, null, 2)}\n`);
if (!flags["dry-run"] && !flags["confirm-live"]) throw new Error("Live benchmark requires --confirm-live. Use --dry-run for harness validation.");
const results = []; for (let replicate = 1; replicate <= replicates; replicate++) results.push(await runPair({ caseId, replicate, seed: plan.seed, timeoutMs: plan.timeoutMs, model: plan.model, dryRun: Boolean(flags["dry-run"]), preserve: Boolean(flags.preserve), experimentPlan: plan }));
process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
