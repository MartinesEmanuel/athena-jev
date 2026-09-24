/* global process, URL */
import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, readdir, stat } from "node:fs/promises";
import { arch, cpus, freemem, platform, release, totalmem } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);

export const CONDITIONS = Object.freeze({
  baseline: { cognition: "off", toolRouter: "off", athenaLoaded: false },
  observe: { cognition: "observe", toolRouter: "observe", athenaLoaded: true },
  cognitive: { cognition: "enforce", toolRouter: "observe", athenaLoaded: true },
  full: { cognition: "enforce", toolRouter: "active", athenaLoaded: true },
});
export const stable = (v) => JSON.stringify(v, Object.keys(v).sort());
export const sha256 = (v) => createHash("sha256").update(v).digest("hex");
export const seeded = (seed) => { let x = (Number(seed) >>> 0) || 1; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32); };
export function conditionOrder(taskId, runIndex, conditions, seed) {
  const r = seeded(Number.parseInt(sha256(`${seed}:${taskId}:${runIndex}`).slice(0, 8), 16));
  return [...conditions].sort(() => r() - 0.5);
}
export async function loadConfig(name) {
  const cfg = JSON.parse(await readFile(new URL(`../config/${name}.json`, import.meta.url), "utf8"));
  const env = process.env;
  cfg.model = { provider: env.ATHENA_BENCH_MODEL_PROVIDER ?? cfg.model.provider, id: env.ATHENA_BENCH_MODEL_ID ?? cfg.model.id, reasoningEffort: env.ATHENA_BENCH_REASONING_EFFORT ?? cfg.model.reasoningEffort };
  cfg.networkPolicy.allowedHost = env.ATHENA_BENCH_MODEL_HOST ?? cfg.networkPolicy.allowedHost;
  return cfg;
}
export async function tasks(root) {
  const dir = join(root, "v2", "tasks");
  const names = (await readdir(dir, { withFileTypes: true })).filter(x => x.isDirectory()).map(x => x.name).sort();
  return names.map(id => ({ id, repository: id.replace(/^instance_/, "").split("-")[0].split("__").join("/"), path: join(dir, id) }));
}
export function stratifiedSelect(all, n, seed) {
  if (n >= all.length) return [...all];
  const groups = new Map(); for (const t of all) groups.set(t.repository, [...(groups.get(t.repository) ?? []), t]);
  const rnd = seeded(seed); for (const xs of groups.values()) xs.sort(() => rnd() - .5);
  const out = []; const keys = [...groups.keys()].sort(); let i = 0;
  while (out.length < n) { const xs = groups.get(keys[i++ % keys.length]); if (xs?.length) out.push(xs.shift()); }
  return out.sort((a,b) => a.id.localeCompare(b.id));
}
export function plan(config, selected) {
  const trajectories = [];
  for (const task of selected) for (let runIndex = 1; runIndex <= config.runsPerTask; runIndex++)
    for (const condition of conditionOrder(task.id, runIndex, config.conditions, config.benchmarkSeed)) trajectories.push({ taskId: task.id, repository: task.repository, runIndex, condition, order: trajectories.length + 1, seed: config.benchmarkSeed });
  return trajectories;
}
export function classifyFailure({ error, exitReason, resolved }) {
  if (resolved) return "none";
  if (/docker daemon|harbor internal|environmentstart|conflicterror|provider outage|machine interruption/i.test(`${error} ${exitReason}`)) return "infrastructure";
  return "agent_system";
}
export function validateRecord(r) {
  const required = ["schemaVersion","runId","taskId","repository","condition","runIndex","seed","identity","outcome","agent","athena","toolRouter"];
  if (required.some(k => r[k] === undefined)) throw Error("result schema missing required field");
  if (!CONDITIONS[r.condition] || typeof r.outcome.resolved !== "boolean") throw Error("invalid condition or outcome");
  if (r.condition === "baseline" && (r.athena.interventions !== 0 || r.toolRouter.pruned !== 0)) throw Error("baseline ATHENA isolation violation");
  if (r.condition === "observe" && (r.athena.interventions !== 0 || r.toolRouter.pruned !== 0)) throw Error("observe intervention violation");
  return r;
}
export async function appendRecord(runDir, record) { validateRecord(record); await mkdir(runDir, { recursive: true }); await appendFile(join(runDir, "results.jsonl"), `${JSON.stringify(record)}\n`); }
export async function readRecords(runDir) { try { return (await readFile(join(runDir, "results.jsonl"), "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse); } catch { return []; } }
export function unfinished(p, prior) { const done = new Set(prior.filter(r => r.outcome?.complete).map(r => `${r.taskId}:${r.runIndex}:${r.condition}`)); return p.filter(x => !done.has(`${x.taskId}:${x.runIndex}:${x.condition}`)); }
export async function gitSha() { try { return (await exec("git", ["rev-parse", "HEAD"])).stdout.trim(); } catch { return "unavailable"; } }
export async function manifest(config, selected) {
  let docker = "unavailable"; try { docker = (await exec("docker", ["version", "--format", "{{.Server.Version}}"])).stdout.trim(); } catch { docker = "unavailable"; }
  return { createdAt: new Date().toISOString(), os: `${platform()} ${release()}`, architecture: arch(), cpu: cpus().map(x => x.model), ramBytes: totalmem(), availableRamBytes: freemem(), dockerVersion: docker, openCodeVersion: await version("opencode"), athenaSha: await gitSha(), harnessSha: await gitSha(), dataset: config.dataset, model: config.model, timeoutSeconds: config.timeoutSeconds, turnLimit: config.turnLimit, networkPolicy: config.networkPolicy, seed: config.benchmarkSeed, workers: config.workers, conditionDefinitions: CONDITIONS, taskIds: selected.map(x => x.id) };
}
async function version(bin) { try { return (await exec(bin, ["--version"])).stdout.trim(); } catch { return "unavailable"; } }
export function paired(records, a="baseline", b="full") {
  const by = new Map(); for (const r of records.filter(r => [a,b].includes(r.condition) && !r.outcome.infraFailure)) by.set(`${r.taskId}:${r.runIndex}`, {...by.get(`${r.taskId}:${r.runIndex}`), [r.condition]: r.outcome.resolved});
  const rows = [...by.entries()].filter(([,v]) => typeof v[a] === "boolean" && typeof v[b] === "boolean").map(([id,v]) => ({ id, baseline: v[a], athena: v[b] }));
  const c = { bothPass:0, baselineOnly:0, athenaOnly:0, bothFail:0 }; for (const r of rows) c[r.baseline ? r.athena ? "bothPass":"baselineOnly" : r.athena ? "athenaOnly":"bothFail"]++;
  return { rows, ...c, delta: rows.length ? (c.athenaOnly-c.baselineOnly)/rows.length : null };
}
export function mcnemar(b, c) { const n=b+c; if (!n) return { method: "exact-binomial", statistic: 0, pValue: 1, discordantPairs: 0 }; let p=0; for(let k=0;k<=Math.min(b,c);k++) p += binom(n,k)*.5**n; return { method: "exact-binomial", statistic: (Math.abs(b-c)-1)**2/n, pValue: Math.min(1, 2*p), discordantPairs: n }; }
function binom(n,k) { let x=1; for(let i=1;i<=k;i++) x*= (n-k+i)/i; return x; }
export function bootstrap(rows, seed, samples=10000) { if (!rows.length) return [null,null]; const r=seeded(seed); const values=[]; for(let s=0;s<samples;s++){let d=0;for(let i=0;i<rows.length;i++){const x=rows[Math.floor(r()*rows.length)];d+=(+x.athena)-(+x.baseline);}values.push(d/rows.length);} values.sort((a,b)=>a-b); return [values[Math.floor(samples*.025)],values[Math.floor(samples*.975)]]; }
export async function doctor(root, config) {
  const checks = {}; const taskRoot = root && join(root,"v2","tasks");
  checks.dataset = !!taskRoot && await stat(taskRoot).then(() => true, () => false);
  checks.taskCount = checks.dataset ? (await tasks(root)).length : 0;
  checks.docker = await version("docker") !== "unavailable"; checks.harbor = await version("harbor") !== "unavailable"; checks.opencode = await version("opencode");
  checks.modelConfigured = !Object.values(config.model).includes("REQUIRED"); checks.modelHostConfigured = config.networkPolicy.allowedHost !== "REQUIRED_MODEL_ENDPOINT";
  checks.safeWorkers = freemem() >= 16*1024**3 && checks.docker ? 1 : 0; checks.safeFullRun = checks.safeWorkers > 0 && checks.taskCount === 642;
  return { checks, resources: { cpu: cpus().length, ramBytes: totalmem(), availableRamBytes: freemem(), freeDiskBytes: await exec("df",["-B1","."]).then(x => Number(x.stdout.trim().split("\n")[1].trim().split(/\s+/)[3])) }, officialGrader: checks.dataset && checks.harbor && await stat(join(root,"v2","tooling","patch_replay.py")).then(()=>true,()=>false) };
}
