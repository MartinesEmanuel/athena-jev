/* global process */
import { dryPhase5BPlan, loadCase, loadPhase5BPlan, planExperiment, prepareExperiment, runPair } from "./index.mjs";

function options(args) { const output = {}; for (let index = 0; index < args.length; index++) { if (!args[index].startsWith("--")) continue; const key = args[index].slice(2); const next = args[index + 1]; output[key] = !next || next.startsWith("--") ? true : args[++index]; } return output; }
const [command, ...args] = process.argv.slice(2); const flags = options(args); const caseIds = command === "experiment" ? String(flags.cases ?? "").split(",").filter(Boolean) : flags.case ? [flags.case] : [];
if (command === "phase5b") {
  const isDryRun = flags["dry-run"] === true;
  const isConfirmLive = flags["confirm-live"] === true;
  if (!isDryRun && !isConfirmLive) throw new Error("Phase 5B live benchmark requires --confirm-live. Use phase5b --dry-run for plan validation.");
  if (isDryRun) {
    process.stdout.write(`${JSON.stringify({ phase5bDryPlan: await dryPhase5BPlan() }, null, 2)}\n`);
    process.exit(0);
  }
  const { plan } = await loadPhase5BPlan();
  const setup = await prepareExperiment({ experimentPlan: plan, dryRun: false });
  const results = [];
  for (const pair of plan.pairs) {
    results.push(await runPair({ caseId: pair.caseId, replicate: pair.replicate, seed: plan.seed, timeoutMs: plan.timeoutMs, model: plan.model, experimentPlan: plan, experimentSetup: setup, confirmLive: true }));
  }
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  process.exit(0);
}
if (!(["pair", "experiment"].includes(command)) || !caseIds.length) throw new Error("Usage: pnpm bench:experiment --cases <case,case> [--replicates 1] [--seed 1] [--timeout 300000] [--model openai/gpt-5.6-terra] [--dry-run] [--confirm-live], or pnpm bench:phase5b --dry-run");
const replicatesRaw = Number(flags.replicates ?? 1);
const seedRaw = Number(flags.seed ?? 1);
const timeoutRaw = flags.timeout ? Number(flags.timeout) : undefined;
const modelRaw = flags.model ?? "openai/gpt-5.6-terra";
if (!Number.isInteger(replicatesRaw) || replicatesRaw < 1) throw new Error("replicates must be a positive integer");
if (!Number.isInteger(seedRaw)) throw new Error("seed must be an integer");
if (timeoutRaw !== undefined && (!Number.isInteger(timeoutRaw) || timeoutRaw < 1000)) throw new Error("timeout must be an integer >= 1000");
if (typeof modelRaw !== "string" || !modelRaw) throw new Error("model must be a non-empty string");
const replicates = replicatesRaw; const caseDefinitions = await Promise.all(caseIds.map(loadCase)); const experimentId = flags["experiment-id"] ?? `bench-${new Date().toISOString().replace(/[:.]/g, "-")}`; const plan = planExperiment({ caseDefinitions, replicates, seed: seedRaw, model: modelRaw, timeoutMs: timeoutRaw ?? caseDefinitions[0].timeoutMs, experimentId });
process.stdout.write(`${JSON.stringify({ runPlan: plan }, null, 2)}\n`);
const isDryRun = flags["dry-run"] === true;
const isConfirmLive = flags["confirm-live"] === true;
if (!isDryRun && !isConfirmLive) throw new Error("Live benchmark requires --confirm-live. Use --dry-run for harness validation.");
const setup = await prepareExperiment({ experimentPlan: plan, dryRun: isDryRun }); const results = []; for (const caseDefinition of caseDefinitions) for (let replicate = 1; replicate <= replicates; replicate++) results.push(await runPair({ caseId: caseDefinition.id, replicate, seed: plan.seed, timeoutMs: plan.timeoutMs, model: plan.model, dryRun: isDryRun, preserve: Boolean(flags.preserve), experimentPlan: plan, experimentSetup: setup, confirmLive: isConfirmLive }));
process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
