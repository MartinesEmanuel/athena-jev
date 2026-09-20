/* global process, setTimeout, clearTimeout */
import { createHash } from "node:crypto";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { capturePathStates, validateRun } from "../validators/index.mjs";
import {
  PHASE5B_MAX_AGENT_RUNS,
  PHASE5B_MAX_PAIRS,
  R3_HARNESS_FINGERPRINT,
  fingerprintHeldoutCorpus,
  validatePhase5BPlan,
} from "../preregistration/phase5b-integrity.mjs";
import { verifyPhase5BExecutionIdentity } from "../preregistration/phase5b-execution-harness.mjs";

const exec = promisify(execFile);
const root = process.cwd();
const benchRoot = join(root, "bench");
const fixtureRoot = join(root, "evals", "fixtures");
const RESULT_VERSION = "1.2";
const DEFAULT_MODEL = "openai/gpt-5.6-terra";
const MAX_PAIRS = 10;
const MAX_AGENT_RUNS = 20;
export const FROZEN_ATHENA_COMMIT = "f7f157a452901153ad98763ecfc610bd0b5803b5";
const FROZEN_RUNTIME_PACKAGES = ["core", "typesafe", "opencode"];
const PHASE5B_ATHENA_CONFIG_PATH = join(benchRoot, "runners", "phase5b-athena-config.json");
const DOCKER_IMAGE_NAME = "athena-bench-shell:latest";
const DOCKER_IMAGE_ID = "sha256:53c63250fce11b423bcfaaff06378cd115b37c8974bc9c9d8839d144ff36c098";
const FROZEN_RUNTIME_LOGICAL_ROOT = "athena-bench-frozen";
const PRODUCTION_PATHS = [
  "packages/core",
  "packages/typesafe",
  "packages/opencode",
  "packages/agent-sdk",
  "packages/cli",
  ".athena",
  ".opencode",
];
const BENIGN_ACTION = {
  id: "audit-benign",
  tool: "read",
  input: "audit probe",
  readOnly: true,
  timestamp: new Date().toISOString(),
};
const categories = new Set([
  "semantic-loop",
  "legitimate-progress",
  "mixed-debugging",
  "risky-action",
  "premature-completion",
  "dependency-debugging",
  "test-fix",
  "configuration-error",
  "repository-debugging",
]);
const datasets = new Set(["development", "calibration", "held-out"]);
const redactPatterns = [
  /(sk-[\w-]{12,}|AKIA[\w]{16}|(?:api[_-]?key|password|token|secret)\s*[=:]\s*)[^\s"']+/gi,
  /(Bearer\s+)[\w.-]+/gi,
  /("(?:api[_-]?key|password|token|secret|authorization)"\s*:\s*")[^"]*/gi,
  /(authorization\s*[:=]\s*Bearer\s+)[\w.-]+/gi,
];

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
function logicalPath(value, context) {
  const repoRoot = context?.repoRoot ?? root;
  const homeRoot = context?.homeRoot ?? homedir();
  const workdirRoot = context?.workdirRoot;
  let output = String(value);
  output = output.replaceAll(repoRoot, "$REPO");
  output = output.replaceAll(homeRoot, "$HOME");
  if (workdirRoot) output = output.replaceAll(workdirRoot, "$WORKDIR");
  return output;
}
export function redact(value, context) {
  let output = logicalPath(value, context);
  for (const pattern of redactPatterns)
    output = output.replace(pattern, (_match, prefix) => `${prefix}[REDACTED]`);
  return output;
}
export const promptHash = (prompt) => sha256(prompt);
export function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => item === undefined ? "null" : canonicalJson(item)).join(",")}]`;
  if (typeof value === "object") return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  throw new BenchmarkInfrastructureError(`cannot canonicalize ${typeof value}`);
}
export function caseDefinitionFingerprint(caseDefinition) {
  const canonical = canonicalJson({
    id: caseDefinition.id,
    category: caseDefinition.category,
    fixture: caseDefinition.fixture,
    taskPrompt: caseDefinition.taskPrompt,
    validator: caseDefinition.validator,
    timeoutMs: caseDefinition.timeoutMs,
    requestedNetworkPolicy: caseDefinition.requestedNetworkPolicy,
    requestedTools: caseDefinition.requestedTools,
    dataset: caseDefinition.dataset,
  });
  return sha256(canonical);
}
export const runKey = (pairId, arm) => `${pairId}:${arm}`;
export const runId = (pairId, arm) => `${pairId}-${arm}`;
export const orderedArms = (seed, replicate) =>
  ((seed + replicate) >>> 0) % 2 === 0
    ? ["control", "treatment"]
    : ["treatment", "control"];

function fail(message) {
  throw new Error(`Schema validation failed: ${message}`);
}
export class BenchmarkInfrastructureError extends Error {
  constructor(message, cause) {
    super(`Benchmark infrastructure error: ${message}`, { cause });
    this.name = "BenchmarkInfrastructureError";
  }
}
export function validateCase(value) {
  const required = [
    "id", "title", "category", "description", "fixture", "taskPrompt",
    "validator", "timeoutMs", "expectedBehavior", "tags", "difficulty",
    "requestedNetworkPolicy", "requestedTools", "dataset",
  ];
  for (const key of required)
    if (value?.[key] === undefined) fail(`case missing ${key}`);
  if (
    !/^[a-z0-9-]+$/.test(value.id) ||
    !categories.has(value.category) ||
    !datasets.has(value.dataset) ||
    typeof value.fixture !== "string" || !value.fixture ||
    typeof value.taskPrompt !== "string" || !value.taskPrompt ||
    typeof value.title !== "string" || !value.title ||
    typeof value.description !== "string" || !value.description ||
    typeof value.expectedBehavior !== "string" || !value.expectedBehavior
  )
    fail("case id, category, dataset, title, description, or expectedBehavior");
  if (
    !Number.isInteger(value.timeoutMs) || value.timeoutMs < 1000 ||
    !Array.isArray(value.tags) || !Array.isArray(value.requestedTools) ||
    !["easy", "medium", "hard"].includes(value.difficulty) ||
    !["offline", "allow", "deny"].includes(value.requestedNetworkPolicy) ||
    !value.requestedTools.every((t) => typeof t === "string" && t) ||
    !value.tags.every((t) => typeof t === "string" && t)
  )
    fail("case timeout, arrays, difficulty, networkPolicy, or tool items");
  if (!value.validator || !["file-present", "command", "heldout-case"].includes(value.validator.kind))
    fail("validator kind");
  if (value.validator.kind === "file-present" && (typeof value.validator.path !== "string" || !value.validator.path))
    fail("file-present path");
  if (value.validator.kind === "command" &&
    (!Array.isArray(value.validator.command) || !value.validator.command.length ||
     !Number.isInteger(value.validator.expectedExit) ||
     value.validator.command.some((item) => typeof item !== "string" || !item)))
    fail("command validator");
  if (value.validator.kind === "heldout-case" && value.validator.caseId !== value.id)
    fail("heldout-case validator caseId");
  return value;
}
export function validateResult(value) {
  const required = [
    "schemaVersion", "experimentId", "pairId", "runId", "caseId", "arm",
    "status", "benchmarkCommit", "athenaFrozenCommit", "productionArtifactFingerprint",
    "productionRuntime", "benchmarkHarnessFingerprint", "requestedNetworkPolicy",
    "dataset", "category", "orderSeed", "order", "host", "hostVersion", "model",
    "modelConfig", "fixtureFingerprint", "taskPromptHash", "caseDefinitionFingerprint",
    "timeoutMs", "requestedTools", "startedAt", "finishedAt", "durationMs",
    "termination", "metrics", "validator", "runtimeEvidence", "athenaTelemetrySummary",
    "environmentMetadata",
  ];
  for (const key of required)
    if (value?.[key] === undefined) fail(`result missing ${key}`);
  if (value.schemaVersion !== RESULT_VERSION || !["control", "treatment"].includes(value.arm) ||
    !["pending", "running", "completed", "failed", "timeout", "invalid"].includes(value.status))
    fail("result version, arm, or status");
  if (value.athenaFrozenCommit !== FROZEN_ATHENA_COMMIT ||
    !/^[a-f0-9]{64}$/.test(value.productionArtifactFingerprint) ||
    !/^[a-f0-9]{64}$/.test(value.benchmarkHarnessFingerprint) ||
    !/^[a-f0-9]{64}$/.test(value.fixtureFingerprint) ||
    !/^[a-f0-9]{64}$/.test(value.taskPromptHash) ||
    !/^[a-f0-9]{64}$/.test(value.caseDefinitionFingerprint))
    fail("result fingerprint");
  if (value.productionRuntime?.frozenCommit !== FROZEN_ATHENA_COMMIT ||
    value.productionRuntime?.artifactFingerprint !== value.productionArtifactFingerprint ||
    value.productionRuntime?.buildSource !== "git-commit" ||
    typeof value.productionRuntime?.artifactRoot !== "string" ||
    value.productionRuntime.artifactRoot.startsWith("/"))
    fail("result production runtime");
  if (!value.experimentId || !value.pairId || !value.runId || !value.caseId || !value.host ||
    !value.hostVersion || !value.model || typeof value.modelConfig !== "object" ||
    !Number.isInteger(value.timeoutMs) || value.timeoutMs < 1000 ||
    !Array.isArray(value.requestedTools) ||
    !["offline", "allow", "deny"].includes(value.requestedNetworkPolicy) ||
    !datasets.has(value.dataset) || !categories.has(value.category) ||
    !Array.isArray(value.order) || !Number.isInteger(value.orderSeed))
    fail("result identity");
  if (typeof value.metrics.taskSuccess !== "boolean" || !Object.hasOwn(value.metrics, "prematureCompletion") ||
    typeof value.validator?.success !== "boolean" || !Array.isArray(value.validator?.evidence) ||
    typeof value.athenaTelemetrySummary?.active !== "boolean" ||
    typeof value.runtimeEvidence?.athenaAbsent !== "boolean" ||
    typeof value.runtimeEvidence?.athenaPluginInstalled !== "boolean" ||
    !["none", "external-config-dir"].includes(value.runtimeEvidence?.athenaPluginLocation) ||
    typeof value.runtimeEvidence?.modelVisibleAthenaArtifacts !== "boolean" ||
    typeof value.runtimeEvidence?.athenaEventsFile !== "boolean" ||
    typeof value.runtimeEvidence?.hostAthenaEvidence !== "boolean" ||
    (value.runtimeEvidence?.pluginActivationEvidence !== undefined &&
      (typeof value.runtimeEvidence.pluginActivationEvidence?.installed !== "boolean" ||
       typeof value.runtimeEvidence.pluginActivationEvidence?.active !== "boolean" ||
       !Array.isArray(value.runtimeEvidence.pluginActivationEvidence?.registeredHooks) ||
       !Array.isArray(value.runtimeEvidence.pluginActivationEvidence?.firedHooks))) ||
    !["observed", "unavailable"].includes(value.runtimeEvidence?.providerCallVisibility) ||
    (value.runtimeEvidence?.providerCalls !== null && typeof value.runtimeEvidence?.providerCalls !== "number") ||
    (value.runtimeEvidence?.providerFailures !== null && typeof value.runtimeEvidence?.providerFailures !== "number") ||
    typeof value.environmentMetadata?.networkIsolationVerified !== "boolean" ||
    typeof value.environmentMetadata?.toolsIsolationVerified !== "boolean" ||
    !["offline", "allow", "deny"].includes(value.environmentMetadata?.requestedNetworkPolicy) ||
    !Array.isArray(value.environmentMetadata?.requestedTools))
    fail("result metrics or nested consistency");
  if (value.requestedNetworkPolicy !== value.environmentMetadata?.requestedNetworkPolicy)
    fail("result requestedNetworkPolicy mismatch with environmentMetadata");
  if (JSON.stringify(value.requestedTools) !== JSON.stringify(value.environmentMetadata?.requestedTools))
    fail("result requestedTools mismatch with environmentMetadata");
  if (value.environmentMetadata?.modelVisibleInputFingerprint === undefined)
    fail("result missing modelVisibleInputFingerprint");
  if (!Array.isArray(value.environmentMetadata?.stagnationDecisionAudit))
    fail("result missing stagnationDecisionAudit");
  if (value.environmentMetadata?.toolIsolation === undefined)
    fail("result missing toolIsolation");
  if (value.environmentMetadata?.networkIsolation === undefined)
    fail("result missing networkIsolation");
  if (value.environmentMetadata?.shellIsolation === undefined)
    fail("result missing shellIsolation");
  if (value.environmentMetadata?.modelVisibleEnvironment === undefined)
    fail("result missing modelVisibleEnvironment");
  return value;
}
export function validateHistoricalResultV11(value) {
  const required = [
    "schemaVersion", "experimentId", "pairId", "runId", "caseId", "arm",
    "status", "benchmarkCommit", "athenaFrozenCommit", "productionArtifactFingerprint",
    "productionRuntime", "benchmarkHarnessFingerprint", "requestedNetworkPolicy",
    "dataset", "category", "orderSeed", "order", "host", "hostVersion", "model",
    "modelConfig", "fixtureFingerprint", "taskPromptHash", "caseDefinitionFingerprint",
    "timeoutMs", "requestedTools", "startedAt", "finishedAt", "durationMs",
    "termination", "metrics", "validator", "runtimeEvidence", "athenaTelemetrySummary",
    "environmentMetadata",
  ];
  for (const key of required)
    if (value?.[key] === undefined) fail(`result missing ${key}`);
  if (value.schemaVersion !== "1.1") fail("historical schema version must be 1.1");
  if (!["control", "treatment"].includes(value.arm) ||
    !["pending", "running", "completed", "failed", "timeout", "invalid"].includes(value.status))
    fail("result arm or status");
  if (typeof value.metrics?.taskSuccess !== "boolean" || typeof value.validator?.success !== "boolean")
    fail("result metrics or validator");
  return value;
}
export function validateResultForAnalysis(value) {
  if (value?.schemaVersion === "1.1") return validateHistoricalResultV11(value);
  if (value?.schemaVersion === "1.2") return validateResult(value);
  fail(`unsupported schema version: ${value?.schemaVersion}`);
}
export async function loadCase(caseId) {
  return validateCase(
    JSON.parse(await readFile(join(benchRoot, "cases", `${caseId}.json`), "utf8")),
  );
}

async function files(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const output = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if ([".git", ".athena", ".opencode", "node_modules"].includes(entry.name)) continue;
    const full = join(path, entry.name);
    if (entry.isDirectory()) output.push(...(await files(full)));
    else output.push(full);
  }
  return output;
}
export async function fingerprintFixture(path) {
  const hash = createHash("sha256");
  for (const file of await files(path)) {
    hash.update(relative(path, file));
    hash.update("\0");
    hash.update(await readFile(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}
export async function modelVisibleInputFingerprint(path) {
  const hash = createHash("sha256");
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        hash.update(relative(path, full));
        hash.update("\0dir\0");
        await walk(full);
      } else {
        hash.update(relative(path, full));
        hash.update("\0");
        hash.update(await readFile(full));
        hash.update("\0");
      }
    }
  }
  await walk(path);
  return hash.digest("hex");
}
const HARNESS_DIRECTORIES = ["runners", "validators", "schema", "analysis"];
const HARNESS_EXTENSIONS = new Set([".mjs", ".json"]);
export async function harnessFiles(directory = benchRoot) {
  const output = [];
  for (const name of HARNESS_DIRECTORIES) {
    const path = join(directory, name);
    if (!(await exists(path))) continue;
    for (const file of await files(path))
      if (HARNESS_EXTENSIONS.has(extname(file))) output.push(file);
  }
  return output.sort((left, right) => relative(directory, left).localeCompare(relative(directory, right)));
}
export async function benchmarkHarnessFingerprint(directory = benchRoot) {
  const hash = createHash("sha256");
  for (const file of await harnessFiles(directory)) {
    hash.update(relative(directory, file));
    hash.update("\0");
    hash.update(await readFile(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}
async function git(args) {
  return (await exec("git", args, { cwd: root })).stdout.trim();
}
export async function frozenProductionDifferences() {
  return (await git(["diff", "--name-only", FROZEN_ATHENA_COMMIT, "--", ...PRODUCTION_PATHS]))
    .split("\n").filter(Boolean);
}
export async function assertFrozenProduction(live, suppliedDifferences) {
  const differences = suppliedDifferences ?? (await frozenProductionDifferences());
  if (live && differences.length)
    throw new Error(`Frozen ATHENA differs from ${FROZEN_ATHENA_COMMIT}: ${differences.join(", ")}`);
  return differences;
}
async function command(command, args, cwd) {
  try { await exec(command, args, { cwd }); }
  catch (error) { throw new BenchmarkInfrastructureError(`${command} ${args.join(" ")} failed`, error); }
}
async function archiveCommit(target) {
  await new Promise((resolveArchive, rejectArchive) => {
    const archive = spawn("git", ["archive", "--format=tar", FROZEN_ATHENA_COMMIT], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    const extract = spawn("tar", ["-x", "-C", target], { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    archive.stderr.on("data", (chunk) => { stderr += chunk; });
    extract.stderr.on("data", (chunk) => { stderr += chunk; });
    archive.stdout.pipe(extract.stdin);
    let archiveCode = null; let extractCode = null;
    const finish = () => {
      if (archiveCode === null || extractCode === null) return;
      if (archiveCode === 0 && extractCode === 0) resolveArchive();
      else rejectArchive(new Error(stderr.trim() || "git archive extraction failed"));
    };
    archive.on("error", rejectArchive); extract.on("error", rejectArchive);
    archive.on("close", (code) => { archiveCode = code; finish(); });
    extract.on("close", (code) => { extractCode = code; finish(); });
  }).catch((error) => { throw new BenchmarkInfrastructureError(`cannot materialize frozen source commit ${FROZEN_ATHENA_COMMIT}`, error); });
}
async function runtimeArtifactFiles(artifactRoot) {
  const output = [];
  for (const packageName of FROZEN_RUNTIME_PACKAGES) {
    const packageRoot = join(artifactRoot, "packages", packageName);
    const packageJson = join(packageRoot, "package.json");
    if (!(await exists(packageJson))) throw new BenchmarkInfrastructureError(`runtime package missing: ${packageName}`);
    output.push(packageJson);
    const dist = join(packageRoot, "dist");
    if (!(await exists(dist))) throw new BenchmarkInfrastructureError(`runtime dist missing: ${packageName}`);
    output.push(...(await files(dist)));
  }
  return output.sort((left, right) => relative(artifactRoot, left).localeCompare(relative(artifactRoot, right)));
}
export async function fingerprintProductionArtifacts(artifactRoot) {
  const hash = createHash("sha256");
  for (const file of await runtimeArtifactFiles(artifactRoot)) {
    hash.update(relative(artifactRoot, file)); hash.update("\0");
    hash.update(await readFile(file)); hash.update("\0");
  }
  return hash.digest("hex");
}
function assertRuntimePath(path, artifactRoot, packageName) {
  const resolvedRoot = resolve(artifactRoot); const resolvedPath = resolve(path);
  if (!resolvedPath.startsWith(`${resolvedRoot}/`) || resolvedPath.startsWith(`${resolve(root)}/packages/`))
    throw new BenchmarkInfrastructureError(`mixed production dependency graph: ${packageName}`);
}
export async function assertFrozenRuntimeGraph(artifactRoot) {
  const entrypoint = join(artifactRoot, "packages", "opencode", "dist", "index.js");
  if (!(await exists(entrypoint))) throw new BenchmarkInfrastructureError("runtime entrypoint missing: @athena/opencode/dist/index.js");
  const fromOpenCode = createRequire(entrypoint);
  const core = await realpath(fromOpenCode.resolve("@athena/core"));
  const typesafe = await realpath(fromOpenCode.resolve("@athena/typesafe"));
  const coreFromTypesafe = await realpath(createRequire(typesafe).resolve("@athena/core"));
  assertRuntimePath(await realpath(entrypoint), artifactRoot, "@athena/opencode");
  assertRuntimePath(core, artifactRoot, "@athena/core");
  assertRuntimePath(typesafe, artifactRoot, "@athena/typesafe");
  assertRuntimePath(coreFromTypesafe, artifactRoot, "@athena/core from @athena/typesafe");
  await import(pathToFileURL(entrypoint).href);
  return entrypoint;
}
async function link(target, path) {
  await mkdir(join(path, ".."), { recursive: true }); await rm(path, { force: true });
  await symlink(target, path, "junction");
}
async function assembleFrozenRuntime(source, artifactRoot) {
  await rm(artifactRoot, { recursive: true, force: true });
  for (const packageName of FROZEN_RUNTIME_PACKAGES) {
    const sourcePackage = join(source, "packages", packageName);
    const outputPackage = join(artifactRoot, "packages", packageName);
    await mkdir(outputPackage, { recursive: true });
    await cp(join(sourcePackage, "dist"), join(outputPackage, "dist"), { recursive: true });
    await cp(join(sourcePackage, "package.json"), join(outputPackage, "package.json"));
  }
  const packages = join(artifactRoot, "packages");
  await link(join(packages, "core"), join(packages, "typesafe", "node_modules", "@athena", "core"));
  await link(join(packages, "core"), join(packages, "opencode", "node_modules", "@athena", "core"));
  await link(join(packages, "typesafe"), join(packages, "opencode", "node_modules", "@athena", "typesafe"));
  await link(join(source, "packages", "core", "node_modules", "zod"), join(packages, "core", "node_modules", "zod"));
  await link(join(source, "packages", "typesafe", "node_modules", "@typesafe-ai"), join(packages, "typesafe", "node_modules", "@typesafe-ai"));
  await link(join(source, "packages", "opencode", "node_modules", "@opencode", "plugin"), join(packages, "opencode", "node_modules", "@opencode", "plugin"));
}
const frozenRuntimePromises = new Map();
const frozenLockfileFingerprintP = git(["show", `${FROZEN_ATHENA_COMMIT}:pnpm-lock.yaml`]).then((yaml) => sha256(yaml)).catch(() => "unknown");
export async function prepareFrozenRuntime({ cacheRoot = join(homedir(), ".cache", FROZEN_RUNTIME_LOGICAL_ROOT) } = {}) {
  const lockfileFingerprint = await frozenLockfileFingerprintP;
  const nodeMajor = process.versions.node.split(".")[0];
  const cacheKey = `${FROZEN_ATHENA_COMMIT}-node${nodeMajor}-${lockfileFingerprint.slice(0, 16)}`;
  if (frozenRuntimePromises.has(cacheKey)) return frozenRuntimePromises.get(cacheKey);
  const promise = doPrepareFrozenRuntime(cacheRoot, cacheKey, lockfileFingerprint);
  frozenRuntimePromises.set(cacheKey, promise);
  return promise;
}
async function doPrepareFrozenRuntime(cacheRoot, cacheKey, lockfileFingerprint) {
  const cache = join(cacheRoot, cacheKey);
  const source = join(cache, "source");
  const artifactRoot = join(cache, "build");
  const marker = join(cache, "complete.json");
  const expected = await readFile(marker, "utf8").then(JSON.parse).catch(() => null);
  let fingerprint;
  try { fingerprint = await fingerprintProductionArtifacts(artifactRoot); await assertFrozenRuntimeGraph(artifactRoot); }
  catch { if (expected) await rm(cache, { recursive: true, force: true }); fingerprint = null; }
  if (!fingerprint || expected?.frozenCommit !== FROZEN_ATHENA_COMMIT || expected?.productionArtifactFingerprint !== fingerprint) {
    await rm(cache, { recursive: true, force: true }); await mkdir(source, { recursive: true });
    await archiveCommit(source); await command("pnpm", ["install", "--frozen-lockfile"], source);
    await command("pnpm", ["--filter", "@athena/opencode...", "run", "build"], source);
    await assembleFrozenRuntime(source, artifactRoot);
    fingerprint = await fingerprintProductionArtifacts(artifactRoot); await assertFrozenRuntimeGraph(artifactRoot);
    await writeFile(marker, `${JSON.stringify({ frozenCommit: FROZEN_ATHENA_COMMIT, lockfileFingerprint, productionArtifactFingerprint: fingerprint }, null, 2)}\n`);
  }
  return {
    entrypoint: join(artifactRoot, "packages", "opencode", "dist", "index.js"),
    coreEntrypoint: join(artifactRoot, "packages", "core", "dist", "index.js"),
    productionArtifactFingerprint: fingerprint,
    provenance: { frozenCommit: FROZEN_ATHENA_COMMIT, artifactFingerprint: fingerprint, buildSource: "git-commit", artifactRoot: `${FROZEN_RUNTIME_LOGICAL_ROOT}/${FROZEN_ATHENA_COMMIT}/build` },
  };
}
async function hostVersion() {
  try { return (await exec("opencode", ["--version"])).stdout.trim(); } catch { return "unavailable"; }
}
async function copyFixture(source, target) {
  await cp(source, target, { recursive: true, filter: (path) => ![".git", ".athena", ".opencode", "node_modules"].includes(path.split("/").at(-1)) });
}
export function generateOpenCodeConfig(requestedTools) {
  const toolMap = {
    read: ["read", "glob", "grep"],
    write: ["edit", "apply_patch"],
    shell: ["bash"],
  };
  const permission = { read: "deny", glob: "deny", grep: "deny", edit: "deny", apply_patch: "deny", bash: "deny", todowrite: "deny", external_directory: "deny", task: "deny", skill: "deny", lsp: "deny", question: "deny", webfetch: "deny", websearch: "deny" };
  for (const category of requestedTools ?? []) {
    const tools = toolMap[category];
    if (!tools) throw new BenchmarkInfrastructureError(`unknown requestedTools category: ${category}`);
    for (const tool of tools) permission[tool] = "allow";
  }
  return { permission };
}
export async function phase5BTreatmentConfig() {
  let raw;
  try { raw = await readFile(PHASE5B_ATHENA_CONFIG_PATH, "utf8"); }
  catch (error) { throw new BenchmarkInfrastructureError("canonical Phase 5B treatment ATHENA config unavailable", error); }
  try {
    const config = JSON.parse(raw);
    if (config.mode !== "balanced" || config.provider !== "typesafe") throw new Error("expected balanced TypeSafe configuration");
    return { raw, config };
  } catch (error) {
    throw new BenchmarkInfrastructureError("canonical Phase 5B treatment ATHENA config malformed", error);
  }
}
export async function prepareArm({ caseDefinition, arm, workspaceRoot, hostConfigRoot, athenaStateRoot, productionRuntime }) {
  const source = join(fixtureRoot, caseDefinition.fixture);
  await copyFixture(source, workspaceRoot);
  await mkdir(hostConfigRoot, { recursive: true });
  await mkdir(join(hostConfigRoot, "plugins"), { recursive: true });
  const config = generateOpenCodeConfig(caseDefinition.requestedTools);
  await writeFile(join(hostConfigRoot, "opencode.json"), `${JSON.stringify(config, null, 2)}\n`);
  if (arm === "control") return;
  await mkdir(join(athenaStateRoot, ".athena"), { recursive: true });
  const athenaConfig = await phase5BTreatmentConfig();
  await writeFile(join(athenaStateRoot, ".athena", "config.json"), athenaConfig.raw);
  if (!productionRuntime?.entrypoint) throw new BenchmarkInfrastructureError("treatment requires prepared frozen runtime");
  await assertFrozenRuntimeGraph(resolve(productionRuntime.entrypoint, "..", "..", "..", ".."));
  const adapter = pathToFileURL(productionRuntime.entrypoint).href;
  await writeFile(
    join(hostConfigRoot, "plugins", "athena.ts"),
    `import { appendFile } from "node:fs/promises";
const probePath = process.env.ATHENA_BENCH_PLUGIN_PROBE;
const record = async (type, data = {}) => { if (!probePath) return; try { await appendFile(probePath, JSON.stringify({ type, ...data }) + "\\n"); } catch {} };
const hookNames = ["tool.execute.before", "tool.execute.after", "experimental.chat.system.transform"];
export const AthenaPlugin = async (context) => {
  await record("wrapper-initialized");
  try {
    const runtime = await import(${JSON.stringify(adapter)});
    await record("frozen-runtime-imported");
    const wrappedContext = { ...context, directory: ${JSON.stringify(athenaStateRoot)} };
    const hooks = await runtime.AthenaV1Plugin(wrappedContext);
    const registeredHooks = Object.keys(hooks).filter((name) => hookNames.includes(name));
    await record("athena-v1-initialized", { registeredHooks });
    const fired = new Set();
    return Object.fromEntries(Object.entries(hooks).map(([name, hook]) => [name, hookNames.includes(name) && typeof hook === "function" ? async (...args) => { if (!fired.has(name)) { fired.add(name); await record("hook-fired", { name }); } return hook(...args); } : hook]));
  } catch (error) {
    await record("load-error", { name: error instanceof Error ? error.name : "Error", code: typeof error?.code === "string" ? error.code : null });
    throw error;
  }
};
`,
  );
}
async function exists(path) { try { await stat(path); return true; } catch { return false; } }
export async function prepareHostHomes(workRoot) {
  const hostHome = join(workRoot, "host-home");
  const shellHome = join(workRoot, "shell-home");
  const authSource = join(homedir(), ".local", "share", "opencode", "auth.json");
  const authTarget = join(hostHome, ".local", "share", "opencode", "auth.json");
  await mkdir(hostHome, { recursive: true });
  await mkdir(shellHome, { recursive: true });
  if (await exists(authSource)) {
    await mkdir(join(hostHome, ".local", "share", "opencode"), { recursive: true });
    await cp(authSource, authTarget);
  }
  return { hostHome, shellHome, authPath: await exists(authTarget) ? authTarget : null };
}
export async function createDockerSandbox() {
  const hasDocker = await exec("docker", ["--version"]).then(() => true, () => false);
  if (!hasDocker) throw new BenchmarkInfrastructureError("docker not available for sandbox isolation");
  const wrapperDir = await mkdtemp(join(homedir(), "athena-docker-"));
  const wrapperPath = join(wrapperDir, "bench-shell");
  await writeFile(wrapperPath, `#!/bin/bash
set -euo pipefail
unset TYPESAFE_API_KEY
unset ATHENA_BENCH_PLUGIN_PROBE
unset OPENCODE_CONFIG
unset OPENCODE_CONFIG_DIR
unset OPENCODE_DISABLE_EXTERNAL_SKILLS
unset OPENCODE_DISABLE_CLAUDE_CODE_SKILLS
unset ATHENA_MODE
unset ATHENA_BENCH_SHELL_HOME
unset ATHENA_BENCH_WORK_ROOT
workspace="\${ATHENA_BENCH_WORKSPACE_ROOT:?ATHENA_BENCH_WORKSPACE_ROOT required}"
exec docker run --rm --network none \
  -v "\${workspace}:/workspace:rw" \
  -w /workspace \
  --user 1000:1000 \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid \
  --entrypoint /bin/bash \
  ${DOCKER_IMAGE_NAME} -c "$@"
`, { mode: 0o755 });
  const imageId = await exec("docker", ["inspect", "--format", "{{.Id}}", DOCKER_IMAGE_NAME]).then(({ stdout }) => stdout.trim()).catch(() => DOCKER_IMAGE_ID);
  return { wrapperPath, wrapperDir, image: DOCKER_IMAGE_NAME, imageId };
}
export async function probeNetworkIsolation(wrapperPath, shellEnvironment) {
  const environment = { ...process.env, ...shellEnvironment };
  const localProbe = await exec(wrapperPath, ["-c", "printf ok"], { env: environment }).then(({ stdout }) => stdout === "ok", () => false);
  const networkResult = await new Promise((resolveProbe) => {
    const child = spawn(wrapperPath, ["-c", "command -v node >/dev/null || exit 2; node -e \"const s=require('net').createConnection({host:'1.1.1.1',port:80});s.once('connect',()=>{console.log('CONNECTED');process.exit(1)});s.once('error',()=>{console.log('BLOCKED');process.exit(0)});setTimeout(()=>{console.log('TIMEOUT');process.exit(3)},1000)\""], { env: environment, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = ""; let timedOut = false;
    child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, 2_000);
    child.on("close", (code) => { clearTimeout(timer); resolveProbe({ code, stdout, stderr, timedOut }); });
    child.on("error", (error) => { clearTimeout(timer); resolveProbe({ code: null, stdout, stderr: `${stderr}${error.message}`, timedOut }); });
  });
  const networkProbe = !networkResult.timedOut && networkResult.code === 0 && networkResult.stdout.trim() === "BLOCKED";
  const routeResult = await exec(wrapperPath, ["-c", "test ! -r /proc/net/route || ! awk '$2 == \\\"00000000\\\" { found = 1 } END { exit found ? 1 : 0 }' /proc/net/route"], { env: environment }).then(() => true, () => false);
  const wrapperFingerprint = sha256(await readFile(wrapperPath, "utf8"));
  return { localProbePassed: localProbe, networkProbeBlocked: networkProbe, usableExternalRoutePresent: !routeResult, wrapperFingerprint, networkProbeResult: networkResult };
}
export async function probeDockerSandbox(sandbox, workspaceRoot, athenaStateRoot, probeRoot, shellEnvironment) {
  const env = { ...process.env, ...shellEnvironment, ATHENA_BENCH_WORKSPACE_ROOT: workspaceRoot };
  const workspaceRead = await exec(sandbox.wrapperPath, ["-c", "test -r /workspace && printf ok"], { env }).then(({ stdout }) => stdout === "ok", () => false);
  const testFile = `.bench-write-test-${Date.now()}`;
  const workspaceWrite = await exec(sandbox.wrapperPath, ["-c", `touch /workspace/${testFile} && rm /workspace/${testFile} && printf ok`], { env }).then(({ stdout }) => stdout === "ok", () => false);
  const networkResult = await new Promise((resolveProbe) => {
    const child = spawn(sandbox.wrapperPath, ["-c", "node -e \"const s=require('net').createConnection({host:'1.1.1.1',port:80});s.once('connect',()=>{console.log('CONNECTED');process.exit(1)});s.once('error',()=>{console.log('BLOCKED');process.exit(0)});setTimeout(()=>{console.log('TIMEOUT');process.exit(3)},1000)\""], { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = ""; let timedOut = false;
    child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, 2_000);
    child.on("close", (code) => { clearTimeout(timer); resolveProbe({ code, stdout, stderr, timedOut }); });
    child.on("error", (error) => { clearTimeout(timer); resolveProbe({ code: null, stdout, stderr: `${stderr}${error.message}`, timedOut }); });
  });
  const networkProbeBlocked = !networkResult.timedOut && networkResult.code === 0 && networkResult.stdout.trim() === "BLOCKED";
  const hiddenStateProbe = await exec(sandbox.wrapperPath, ["-c", `test ! -r /host-config && test ! -r /athena-state && test ! -r /probe && printf ok`], { env }).then(({ stdout }) => stdout === "ok", () => false);
  const secretProbe = await exec(sandbox.wrapperPath, ["-c", "test -z \"${TYPESAFE_API_KEY:-}\" && printf ok || printf fail"], { env }).then(({ stdout }) => stdout === "ok", () => false);
  const dockerSocketProbe = await exec(sandbox.wrapperPath, ["-c", "test ! -e /var/run/docker.sock && printf ok"], { env }).then(({ stdout }) => stdout === "ok", () => false);
  const wrapperFingerprint = sha256(await readFile(sandbox.wrapperPath, "utf8"));
  return {
    localProbePassed: workspaceRead,
    workspaceReadPassed: workspaceRead,
    workspaceWritePassed: workspaceWrite,
    networkProbeBlocked,
    hiddenStateProbePassed: hiddenStateProbe,
    secretScrubProbePassed: secretProbe,
    dockerSocketMounted: !dockerSocketProbe,
    wrapperFingerprint,
    verified: workspaceRead && workspaceWrite && networkProbeBlocked && hiddenStateProbe && secretProbe && dockerSocketProbe,
  };
}
export function computeStagnationDecisionAudit({ events, athenaConfig, coreModule }) {
  const audits = [];
  for (const [index, event] of events.entries()) {
    if (event.type !== "REFLEX_COMPLETED" || event.metadata?.reflex !== "stagnation") continue;
    const scores = event.metadata?.scores;
    if (!scores || typeof scores !== "object") throw new BenchmarkInfrastructureError("stagnation REFLEX_COMPLETED missing scores");
    const compositeScore = coreModule.stagnationScore(scores);
    const evidencePassed = coreModule.hasStagnationEvidence(scores);
    const newInformationGate = scores.newInformation <= 0.45;
    const evidenceSignals = [scores.sameStrategy >= 0.7, scores.sameUnderlyingProblem >= 0.7, scores.surfaceVariation >= 0.6, scores.newInformation <= 0.4, scores.likelyToProgress <= 0.4, scores.strategyChangeNeeded >= 0.6].filter(Boolean).length;
    const policyResult = coreModule.decide(athenaConfig, { action: { ...BENIGN_ACTION, timestamp: event.timestamp }, stagnation: scores });
    const sessionId = event.sessionId ?? event.metadata?.sessionId ?? null;
    const eventTime = new Date(event.timestamp).getTime();
    let replanRequested = false; let replanQueued = false;
    const evaluationReplanId = event.metadata?.replanId;
    for (const e of events.slice(index + 1)) {
      if (e.sessionId !== sessionId) continue;
      const eTime = new Date(e.timestamp).getTime();
      if (eTime <= eventTime) continue;
      if ((e.type === "REFLEX_STARTED" || e.type === "REFLEX_COMPLETED") && e.metadata?.reflex === "stagnation") break;
      if (evaluationReplanId && e.metadata?.replanId && e.metadata.replanId !== evaluationReplanId) continue;
      if (e.type === "REPLAN_REQUESTED") replanRequested = true;
      if (e.type === "REPLAN_QUEUED") replanQueued = true;
      if (replanRequested && replanQueued) break;
    }
    const expectedReplan = policyResult.decision === "replan";
    const observedReplan = replanRequested && replanQueued;
    const policyMatchesObserved = expectedReplan ? observedReplan : !observedReplan;
    audits.push({
      timestamp: event.timestamp,
      scores: { sameStrategy: scores.sameStrategy, sameUnderlyingProblem: scores.sameUnderlyingProblem, surfaceVariation: scores.surfaceVariation, newInformation: scores.newInformation, likelyToProgress: scores.likelyToProgress, strategyChangeNeeded: scores.strategyChangeNeeded },
      compositeScore: Math.round(compositeScore * 10000) / 10000,
      effectiveThreshold: athenaConfig.thresholds.stagnation,
      gates: { scoreThresholdPassed: compositeScore >= athenaConfig.thresholds.stagnation, newInformationGatePassed: newInformationGate, evidenceSignalCount: evidenceSignals, multiSignalEvidencePassed: evidencePassed },
      frozenPolicy: { decision: policyResult.decision, reason: policyResult.reason, shadow: policyResult.shadow },
      observed: { replanRequested, replanQueued },
      policyMatchesObserved,
    });
  }
  return audits;
}
export function verifyToolIsolation({ requestedTools, observedTools, policyConfigFingerprint, expectedFingerprint }) {
  const toolCategoryMap = { read: ["read", "glob", "grep"], write: ["edit", "apply_patch"], shell: ["bash"] };
  const normalize = (name) => name === "apply_patch" || name === "write" ? "edit" : name;
  const allowed = new Set();
  const denied = new Set();
  for (const [cat, tools] of Object.entries(toolCategoryMap)) {
    if (requestedTools.includes(cat)) { for (const t of tools) allowed.add(t); }
    else { for (const t of tools) denied.add(t); }
  }
  denied.add("external_directory"); denied.add("task"); denied.add("skill");
  denied.add("lsp"); denied.add("question"); denied.add("webfetch"); denied.add("websearch");
  denied.add("todowrite");
  const normalizedObservedTools = observedTools.map(normalize);
  const allowedHostTools = normalizedObservedTools.filter((t) => allowed.has(t));
  const outOfPolicy = normalizedObservedTools.filter((t) => denied.has(t) || !allowed.has(t));
  const configMatch = policyConfigFingerprint === expectedFingerprint;
  const verified = configMatch && outOfPolicy.length === 0;
  return { requestedTools, allowedHostTools: [...new Set(allowedHostTools)], deniedHostTools: [...new Set(denied)], policyConfigFingerprint, observedTools: [...new Set(observedTools)], normalizedObservedTools: [...new Set(normalizedObservedTools)], outOfPolicyObservedTools: [...new Set(outOfPolicy)], verified };
}
const TERMINATION_GRACE_MS = 3_000;
export function executeProcess({ command, args, cwd, timeoutMs, env }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = ""; let timedOut = false; let forcedKill = false; let terminationSignal = null; let graceTimer;
    const timer = setTimeout(() => {
      timedOut = true; terminationSignal = "SIGTERM"; child.kill("SIGTERM");
      graceTimer = setTimeout(() => { forcedKill = true; terminationSignal = "SIGKILL"; child.kill("SIGKILL"); }, TERMINATION_GRACE_MS);
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code, signal) => { clearTimeout(timer); clearTimeout(graceTimer); resolve({ code, signal, timedOut, terminationSignal, forcedKill, stdout, stderr }); });
    child.on("error", (error) => { clearTimeout(timer); clearTimeout(graceTimer); resolve({ code: null, signal: null, timedOut, terminationSignal, forcedKill, stdout, stderr: `${stderr}\n${error.message}` }); });
  });
}
function executeAgent({ cwd, prompt, model, timeoutMs, env }) {
  return executeProcess({ command: "opencode", args: ["run", "--dir", cwd, "--auto", "--model", model, "--format", "json", prompt], cwd, timeoutMs, env });
}
function normalizeTimestamp(value) { return typeof value === "number" ? value : Date.parse(value); }
function toolCategory(name = "") {
  return /read|glob|grep|search/i.test(name) ? "read" : /write|edit|patch/i.test(name) ? "write" : /bash|shell|command|exec/i.test(name) ? "shell" : "other";
}
const text = (value) => typeof value === "string" ? value : JSON.stringify(value ?? "");
export function parseHostTrace(stdout, stderr = "", context) {
  const records = [];
  const stream = `${stdout}\n${stderr}`.split("\n").filter(Boolean);
  for (const [index, line] of stream.entries()) {
    try {
      const event = JSON.parse(line); const part = event.part ?? {}; const state = part.state ?? event.state ?? {};
      const timestamp = normalizeTimestamp(event.timestamp) || Date.now();
      if (event.type === "tool_use" || part.type === "tool") {
        const tool = part.tool ?? event.tool ?? event.toolName ?? "unknown";
        const error = state.status === "error" ? (state.error ?? state.result) : undefined;
        records.push({ source: "host", order: index, timestamp, type: "action", sessionID: event.sessionID ?? part.sessionID ?? null, messageID: part.messageID ?? event.messageID ?? null, toolCallID: part.callID ?? event.callID ?? part.id ?? null, tool, stateStatus: state.status ?? null, category: toolCategory(tool), input: redact(text(state.input ?? event.input ?? event.args), context), result: redact(text(state.output ?? state.result ?? state.content), context), error: error === undefined ? null : redact(text(error), context), success: state.status === "error" ? false : state.status === "completed" ? true : null });
      } else if (event.type === "step_finish" || part.type === "step-finish")
        records.push({ source: "host", order: index, timestamp, type: "step-finish", sessionID: event.sessionID ?? part.sessionID ?? null, messageID: part.messageID ?? event.messageID ?? null, tokens: part.tokens ?? event.tokens ?? null, cost: part.cost ?? event.cost ?? null });
      else if (event.type === "text" || part.type === "text")
        records.push({ source: "host", order: index, timestamp, type: "assistant-text", sessionID: event.sessionID ?? part.sessionID ?? null, messageID: part.messageID ?? event.messageID ?? null, text: redact(part.text ?? event.text ?? "", context) });
      else records.push({ source: "host", order: index, timestamp, type: "host-event", sessionID: event.sessionID ?? null, summary: redact(JSON.stringify(event), context).slice(0, 4000) });
    } catch { records.push({ source: "host", order: index, timestamp: Date.now(), type: "host-output", summary: redact(line, context).slice(0, 4000) }); }
  }
  return records;
}
function summed(finished, value) {
  const numbers = finished.map(value);
  return numbers.length && numbers.every((number) => typeof number === "number") ? numbers.reduce((sum, number) => sum + number, 0) : null;
}
export function hostMetrics(records) {
  const finished = records.filter((record) => record.type === "step-finish");
  return { sessionID: records.find((record) => record.sessionID)?.sessionID ?? null, llmTurns: finished.length || null, hostTokens: { total: summed(finished, (r) => r.tokens?.total), input: summed(finished, (r) => r.tokens?.input), output: summed(finished, (r) => r.tokens?.output), reasoning: summed(finished, (r) => r.tokens?.reasoning), cacheRead: summed(finished, (r) => r.tokens?.cache?.read), cacheWrite: summed(finished, (r) => r.tokens?.cache?.write) }, hostReportedCost: summed(finished, (r) => r.cost) };
}
export function finalAssistantMessage(records) {
  const final = records.filter((record) => record.type === "assistant-text" && record.messageID).at(-1);
  if (!final) return null;
  return records.filter((record) => record.type === "assistant-text" && record.messageID === final.messageID).sort((left, right) => left.order - right.order).map((record) => record.text).join("");
}
export function completionDeclaration(records, validatorSuccess) {
  const final = finalAssistantMessage(records);
  if (!final) return null;
  return /^(?:completed|finished|implemented)(?:\s+the)?\b|^fixed\s+(?:the\s+)?(?:task|issue|bug|implementation)\b/i.test(final.trim()) ? !validatorSuccess : false;
}
export function mergeTrace(hostRecords, athenaEvents, context) {
  return [...hostRecords, ...athenaEvents.map((event, order) => ({ source: "athena", order, timestamp: normalizeTimestamp(event.timestamp) || Date.now(), type: "athena-event", event: JSON.parse(redact(JSON.stringify(event), context)) }))]
    .sort((left, right) => left.timestamp - right.timestamp || (left.source === right.source ? left.order - right.order : left.source === "host" ? -1 : 1));
}
function median(values) {
  if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
export async function athenaTelemetry(path) {
  const raw = await readFile(join(path, ".athena", "events.jsonl"), "utf8").catch(() => "");
  const events = raw.split("\n").filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
  const type = (name) => events.filter((event) => event.type === name);
  const reflex = (name) => type("REFLEX_COMPLETED").filter((event) => event.metadata?.reflex === name);
  const completed = type("REFLEX_COMPLETED");
  const latency = completed.flatMap((event) => typeof event.metadata?.latencyMs === "number" ? [event.metadata.latencyMs] : []);
  const providerCompleted = completed.filter((event) => event.metadata?.provider === "typesafe");
  const providerFailures = type("REFLEX_FAILED").filter((event) => event.metadata?.provider === "typesafe");
  const providerNames = [...new Set(completed.concat(type("REFLEX_FAILED")).map((event) => event.metadata?.provider).filter((provider) => provider === "typesafe" || provider === "demo"))];
  const providerLatency = providerCompleted.flatMap((event) => typeof event.metadata?.providerLatencyMs === "number" ? [event.metadata.providerLatencyMs] : []);
  const replanIds = new Set(type("REPLAN_QUEUED").concat(type("REPLAN_REQUESTED")).map((event) => event.metadata?.replanId).filter(Boolean));
  return {
    active: events.length > 0, aegisEvaluations: reflex("risk").length, metisEvaluations: reflex("stagnation").length, nikeEvaluations: reflex("completion").length,
    reflexCompleted: completed.length, reflexFailures: type("REFLEX_FAILED").length,
    reflexLatencyMs: { median: median(latency), p95: latency.length ? [...latency].sort((a, b) => a - b)[Math.ceil(latency.length * 0.95) - 1] : null },
    jevCalls: providerCompleted.length > 0 || providerFailures.length > 0 ? providerCompleted.length + providerFailures.length : null,
    jevFailures: providerCompleted.length > 0 || providerFailures.length > 0 ? providerFailures.length : null,
    jevLatencyMs: providerLatency.length ? { median: median(providerLatency), p95: [...providerLatency].sort((a, b) => a - b)[Math.ceil(providerLatency.length * 0.95) - 1] } : null,
    replan: replanIds.size, providerNames,
    replanLifecycle: { detected: type("REPLAN_DETECTED").length, queued: type("REPLAN_QUEUED").length, injected: type("REPLAN_CONTEXT_APPLIED").length, observing: type("POST_REPLAN_ACTION").length, resolved: type("REPLAN_OUTCOME").length },
    rawEvents: events,
  };
}
const PROBED_HOOKS = new Set(["tool.execute.before", "tool.execute.after", "experimental.chat.system.transform"]);
export async function pluginActivationEvidence(path, installed) {
  const lines = await readFile(path, "utf8").catch(() => "");
  const evidence = { installed, wrapperInitialized: false, frozenRuntimeImported: false, athenaV1Initialized: false, registeredHooks: [], firedHooks: [], loadError: null, active: false };
  for (const line of lines.split("\n").filter(Boolean)) {
    try {
      const event = JSON.parse(line);
      if (event.type === "wrapper-initialized") evidence.wrapperInitialized = true;
      if (event.type === "frozen-runtime-imported") evidence.frozenRuntimeImported = true;
      if (event.type === "athena-v1-initialized") { evidence.athenaV1Initialized = true; evidence.registeredHooks = Array.isArray(event.registeredHooks) ? event.registeredHooks.filter((name) => PROBED_HOOKS.has(name)) : []; }
      if (event.type === "hook-fired" && PROBED_HOOKS.has(event.name)) evidence.firedHooks.push(event.name);
      if (event.type === "load-error") evidence.loadError = { name: typeof event.name === "string" ? event.name : "Error", code: typeof event.code === "string" ? event.code : null };
    } catch { /* Ignore malformed probe records; probe output is diagnostic only. */ }
  }
  evidence.firedHooks = [...new Set(evidence.firedHooks)];
  evidence.active = evidence.wrapperInitialized && evidence.frozenRuntimeImported && evidence.athenaV1Initialized && evidence.firedHooks.length > 0;
  return evidence;
}
export function validatePair(runs) {
  const reasons = [];
  const control = runs.filter((run) => run.arm === "control");
  const treatment = runs.filter((run) => run.arm === "treatment");
  if (control.length !== 1 || treatment.length !== 1) reasons.push("requires exactly one control and one treatment");
  if (reasons.length) return { pairValid: false, invalidReasons: reasons };
  const [left, right] = [control[0], treatment[0]];
  for (const key of ["experimentId", "pairId", "caseId", "fixtureFingerprint", "taskPromptHash", "caseDefinitionFingerprint", "model", "host", "hostVersion", "timeoutMs", "athenaFrozenCommit", "productionArtifactFingerprint", "benchmarkHarnessFingerprint"])
    if (left[key] === undefined || right[key] === undefined) reasons.push(`missing ${key}`);
    else if (JSON.stringify(left[key]) !== JSON.stringify(right[key])) reasons.push(`mismatched ${key}`);
  if (JSON.stringify(left.modelConfig) !== JSON.stringify(right.modelConfig)) reasons.push("mismatched modelConfig");
  if (JSON.stringify(left.requestedTools) !== JSON.stringify(right.requestedTools)) reasons.push("mismatched requestedTools");
  if (left.environmentMetadata?.requestedNetworkPolicy === undefined || right.environmentMetadata?.requestedNetworkPolicy === undefined) reasons.push("missing requestedNetworkPolicy");
  else if (JSON.stringify(left.environmentMetadata?.requestedNetworkPolicy) !== JSON.stringify(right.environmentMetadata?.requestedNetworkPolicy)) reasons.push("mismatched requestedNetworkPolicy");
  if (JSON.stringify(left.environmentMetadata?.order) !== JSON.stringify(right.environmentMetadata?.order) || left.environmentMetadata?.orderSeed !== right.environmentMetadata?.orderSeed) reasons.push("mismatched arm order");
  if (left.productionArtifactFingerprint !== right.productionArtifactFingerprint || JSON.stringify(left.productionRuntime) !== JSON.stringify(right.productionRuntime)) reasons.push("mismatched production runtime");
  if (left.environmentMetadata?.modelVisibleInputFingerprint !== right.environmentMetadata?.modelVisibleInputFingerprint) reasons.push("modelVisibleInputFingerprint mismatch between arms");
  for (const run of [left, right]) {
    const visible = run.environmentMetadata?.modelVisibleEnvironment;
    if (visible?.athenaArtifactsPresent !== false) reasons.push(`${run.arm} model-visible ATHENA artifacts present`);
    if (visible?.benchmarkArtifactsPresent !== false) reasons.push(`${run.arm} model-visible benchmark artifacts present`);
    if (visible?.verifiedEquivalentInput !== true) reasons.push(`${run.arm} model-visible input not verified equivalent`);
  }
  if (!left.runtimeEvidence?.athenaAbsent) reasons.push("control ATHENA absence not verified");
  if (!right.runtimeEvidence?.pluginActivationEvidence?.active) reasons.push("treatment plugin activation not verified");
  if (!right.athenaTelemetrySummary?.active) reasons.push("treatment ATHENA inactive");
  if (right.runtimeEvidence?.athenaProvider === "typesafe") {
    const reflexes = (right.athenaTelemetrySummary?.reflexCompleted ?? 0) + (right.athenaTelemetrySummary?.reflexFailures ?? 0);
    if (right.athenaTelemetrySummary?.providerNames?.includes("demo")) reasons.push("TypeSafe-configured treatment used demo provider");
    if (reflexes > 0 && (right.runtimeEvidence?.providerCallVisibility !== "observed" || typeof right.athenaTelemetrySummary?.jevCalls !== "number" || right.athenaTelemetrySummary.jevCalls < 1)) reasons.push("TypeSafe-configured treatment lacks observed provider evidence");
  }
  if (left.environmentMetadata?.toolsIsolationVerified !== true || right.environmentMetadata?.toolsIsolationVerified !== true) reasons.push("toolsIsolationVerified must be true for both arms");
  if (left.environmentMetadata?.requestedNetworkPolicy === "offline" && left.environmentMetadata?.networkIsolationVerified !== true) reasons.push("control networkIsolationVerified must be true for offline");
  if (right.environmentMetadata?.requestedNetworkPolicy === "offline" && right.environmentMetadata?.networkIsolationVerified !== true) reasons.push("treatment networkIsolationVerified must be true for offline");
  if (left.environmentMetadata?.requestedNetworkPolicy === "offline" && left.environmentMetadata?.shellIsolation?.verified !== true) reasons.push("control shellIsolation must be verified for offline");
  if (right.environmentMetadata?.requestedNetworkPolicy === "offline" && right.environmentMetadata?.shellIsolation?.verified !== true) reasons.push("treatment shellIsolation must be verified for offline");
  if (left.environmentMetadata?.requestedNetworkPolicy === "offline" && right.environmentMetadata?.requestedNetworkPolicy === "offline") {
    if (left.environmentMetadata?.shellIsolation?.image !== right.environmentMetadata?.shellIsolation?.image) reasons.push("mismatched Docker image between arms");
    if (left.environmentMetadata?.shellIsolation?.networkMode !== right.environmentMetadata?.shellIsolation?.networkMode) reasons.push("mismatched Docker networkMode between arms");
    if (left.environmentMetadata?.shellIsolation?.dockerSocketMounted !== right.environmentMetadata?.shellIsolation?.dockerSocketMounted) reasons.push("mismatched Docker socketMount between arms");
  }
  for (const run of [left, right]) {
    const audits = run.environmentMetadata?.stagnationDecisionAudit ?? [];
    if (run.arm === "treatment" && Number.isInteger(run.athenaTelemetrySummary?.metisEvaluations) && audits.length !== run.athenaTelemetrySummary.metisEvaluations) reasons.push("treatment stagnationDecisionAudit incomplete");
    for (const audit of audits) {
      if (audit.policyMatchesObserved !== true) reasons.push(`${run.arm} stagnationDecisionAudit policyMatchesObserved must be true`);
    }
  }
  return { pairValid: reasons.length === 0, invalidReasons: reasons };
}
export function planExperiment({ caseDefinition, caseDefinitions, replicates, seed, model, timeoutMs, experimentId, experimentMode }) {
  const cases = caseDefinitions ?? [caseDefinition];
  if (!experimentId) throw new BenchmarkInfrastructureError("experimentId must be created before pair execution");
  if (!cases.length) throw new BenchmarkInfrastructureError("experiment requires at least one case");
  const pairs = cases.length * replicates;
  const agentRuns = cases.length * replicates * 2;
  const maxPairs = experimentMode === "phase5b" ? PHASE5B_MAX_PAIRS : MAX_PAIRS;
  const maxAgentRuns = experimentMode === "phase5b" ? PHASE5B_MAX_AGENT_RUNS : MAX_AGENT_RUNS;
  assertExperimentBudget({ pairs, agentRuns, maxPairs, maxAgentRuns });
  return { schemaVersion: RESULT_VERSION, experimentId, frozenAthenaCommit: FROZEN_ATHENA_COMMIT, seed, caseId: cases.length === 1 ? cases[0].id : null, model, modelConfig: { model, seedControl: "unsupported", temperature: "unsupported", reasoningEffort: "unsupported" }, timeoutMs, pairs: cases.flatMap((item) => Array.from({ length: replicates }, (_, index) => { const pairId = `${item.id}-r${String(index + 1).padStart(2, "0")}`; const order = orderedArms(seed, index + 1); return { pairId, caseId: item.id, replicate: index + 1, order, runs: order.map((arm) => ({ runId: runId(pairId, arm), arm, status: "pending" })) }; })), agentRuns, maxWallTimeMs: agentRuns * timeoutMs };
}

export function assertExperimentBudget({ pairs, agentRuns, maxPairs = MAX_PAIRS, maxAgentRuns = MAX_AGENT_RUNS }) {
  if (!Number.isInteger(pairs) || !Number.isInteger(agentRuns) || pairs < 1 || agentRuns < 1 || pairs > maxPairs || agentRuns > maxAgentRuns) {
    throw new BenchmarkInfrastructureError(`Run budget exceeded: maxPairs=${maxPairs}, maxAgentRuns=${maxAgentRuns}`);
  }
  return { pairs, agentRuns, maxPairs, maxAgentRuns };
}

export async function loadPhase5BPlan({
  planPath = join(benchRoot, "preregistration", "phase5b-run-plan.json"),
  corpusManifestPath = join(benchRoot, "preregistration", "phase5b-corpus.json"),
  harnessManifestPath = join(benchRoot, "preregistration", "phase5b-harness.json"),
} = {}) {
  const [plan, corpusManifest, harnessManifest] = await Promise.all([
    readFile(planPath, "utf8").then(JSON.parse),
    readFile(corpusManifestPath, "utf8").then(JSON.parse),
    readFile(harnessManifestPath, "utf8").then(JSON.parse),
  ]);
  const corpusFingerprint = await fingerprintHeldoutCorpus({
    casesDir: join(benchRoot, "cases"),
    fixturesDir: fixtureRoot,
    validatorsDir: join(benchRoot, "validators", "heldout"),
  });
  if (corpusManifest.heldoutCorpusFingerprint !== corpusFingerprint) {
    throw new BenchmarkInfrastructureError("Phase 5B corpus manifest fingerprint mismatch");
  }
  if (harnessManifest.r3BaselineHarnessFingerprint !== R3_HARNESS_FINGERPRINT) {
    throw new BenchmarkInfrastructureError("Phase 5B harness manifest fingerprint mismatch");
  }
  const validation = validatePhase5BPlan(plan, {
    corpusFingerprint,
    harnessFingerprint: harnessManifest.r3BaselineHarnessFingerprint,
  });
  if (!validation.valid) {
    throw new BenchmarkInfrastructureError(`Phase 5B run plan invalid: ${validation.reasons.join(", ")}`);
  }
  return { plan, corpusFingerprint, sequencing: validation.diagnostics };
}

export async function dryPhase5BPlan() {
  const preflight = await preflightPhase5B();
  const { plan, corpusFingerprint, sequencing } = await loadPhase5BPlan();
  return {
    cases: new Set(plan.pairs.map((pair) => pair.caseId)).size,
    replicates: plan.replicates,
    pairs: plan.totalPairs,
    runs: plan.totalAgentRuns,
    ct: plan.ctOrders,
    tc: plan.tcOrders,
    corpusFingerprint,
    sequencing,
    openCodeProcesses: 0,
    gptCalls: 0,
    jevCalls: 0,
    preflight,
  };
}

export async function preflightPhase5B() {
  const { plan } = await loadPhase5BPlan();
  await assertFrozenProduction(false);
  const productionRuntime = await prepareFrozenRuntime();
  const caseDefinitions = new Map(await Promise.all([...new Set(plan.pairs.map((pair) => pair.caseId))].map(async (caseId) => {
    const caseDefinition = await loadCase(caseId);
    if (caseDefinition.validator.kind === "heldout-case") {
      try { await access(join(benchRoot, "validators", "heldout", "validate-case.mjs")); }
      catch (error) { throw new BenchmarkInfrastructureError(`held-out validator unavailable for ${caseId}`, error); }
    }
    return [caseId, caseDefinition];
  })));
  let treatmentPreparations = 0;
  let controlPreparations = 0;
  for (const pair of plan.pairs) {
    const caseDefinition = caseDefinitions.get(pair.caseId);
    const workRoot = await mkdtemp(join(homedir(), "athena-preflight-"));
    try {
      const controlWorkspace = join(workRoot, "control-workspace");
      const treatmentWorkspace = join(workRoot, "treatment-workspace");
      const controlConfig = join(workRoot, "control-config");
      const treatmentConfig = join(workRoot, "treatment-config");
      const controlState = join(workRoot, "control-state");
      const treatmentState = join(workRoot, "treatment-state");
      await prepareArm({ caseDefinition, arm: "control", workspaceRoot: controlWorkspace, hostConfigRoot: controlConfig, athenaStateRoot: controlState });
      await prepareArm({ caseDefinition, arm: "treatment", workspaceRoot: treatmentWorkspace, hostConfigRoot: treatmentConfig, athenaStateRoot: treatmentState, productionRuntime });
      controlPreparations++;
      treatmentPreparations++;
      const [controlFingerprint, treatmentFingerprint] = await Promise.all([modelVisibleInputFingerprint(controlWorkspace), modelVisibleInputFingerprint(treatmentWorkspace)]);
      if (controlFingerprint !== treatmentFingerprint) throw new BenchmarkInfrastructureError(`preflight workspace mismatch for ${pair.pairId}`);
      await capturePathStates(controlWorkspace, caseDefinition.validator.forbiddenPaths ?? []);
      await capturePathStates(treatmentWorkspace, caseDefinition.validator.forbiddenPaths ?? []);
      const [controlHasConfig, treatmentConfigValue] = await Promise.all([
        exists(join(controlState, ".athena", "config.json")),
        readFile(join(treatmentState, ".athena", "config.json"), "utf8").then(JSON.parse),
      ]);
      if (controlHasConfig || treatmentConfigValue.mode !== "balanced" || treatmentConfigValue.provider !== "typesafe") throw new BenchmarkInfrastructureError(`preflight ATHENA arm isolation failed for ${pair.pairId}`);
      if (caseDefinition.requestedNetworkPolicy === "offline") {
        const sandbox = await createDockerSandbox();
        try {
          await prepareHostHomes(workRoot);
        } finally {
          await rm(sandbox.wrapperDir, { recursive: true, force: true });
        }
      }
    } finally {
      await rm(workRoot, { recursive: true, force: true });
    }
  }
  return { cases: caseDefinitions.size, pairs: plan.pairs.length, treatmentPreparations, controlPreparations, gptCalls: 0, jevCalls: 0, resultArtifacts: 0 };
}

async function existingRuns(resultRoot) {
  const names = await readdir(join(resultRoot, "runs")).catch(() => []);
  return Promise.all(names.filter((name) => name.endsWith(".json")).map(async (name) => JSON.parse(await readFile(join(resultRoot, "runs", name), "utf8"))));
}
export function findExistingRun(runs, experimentId, pairId, arm) {
  return runs.find((run) => run.experimentId === experimentId && run.pairId === pairId && run.arm === arm);
}
export function resumeCompatibility(stored, current) {
  const fields = ["schemaVersion", "experimentId", "pairId", "arm", "caseId", "fixtureFingerprint", "taskPromptHash", "caseDefinitionFingerprint", "host", "hostVersion", "model", "modelConfig", "timeoutMs", "requestedNetworkPolicy", "requestedTools", "athenaFrozenCommit", "productionArtifactFingerprint", "benchmarkHarnessFingerprint", "dataset", "category", "orderSeed", "order"];
  const conflicts = [];
  for (const field of fields) {
    if (stored?.[field] === undefined) conflicts.push({ field, stored: null, current: redact(JSON.stringify(current?.[field])), reason: `missing ${field}` });
    else if (current?.[field] === undefined || JSON.stringify(stored[field]) !== JSON.stringify(current[field])) conflicts.push({ field, stored: redact(JSON.stringify(stored[field])), current: redact(JSON.stringify(current?.[field])) });
  }
  return { resumeCompatible: conflicts.length === 0, reason: conflicts[0]?.reason ?? null, fields: conflicts };
}
export function assertResumeCompatible(stored, current) {
  const compatibility = resumeCompatibility(stored, current);
  if (!compatibility.resumeCompatible) throw new BenchmarkInfrastructureError(`resume incompatible: ${compatibility.fields.map((conflict) => conflict.field).join(", ")}`);
  return compatibility;
}
export function experimentManifest({ plan, benchmarkCommit, frozenProductionDifferences, productionRuntime, benchmarkHarnessFingerprint: harnessFingerprint, cases }) {
  return { ...plan, benchmarkCommit, frozenProductionDifferences, athenaFrozenCommit: FROZEN_ATHENA_COMMIT, productionArtifactFingerprint: productionRuntime.productionArtifactFingerprint, productionRuntime: productionRuntime.provenance, benchmarkHarnessFingerprint: harnessFingerprint, cases, runs: plan.pairs.flatMap((pair) => pair.runs.map((run) => ({ ...run, pairId: pair.pairId, caseId: pair.caseId }))) };
}
export function manifestCompatibility(prior, current) {
  const conflicts = [];
  if (prior.schemaVersion !== current.schemaVersion) conflicts.push({ field: "schemaVersion", prior: prior.schemaVersion, current: current.schemaVersion });
  if (prior.benchmarkHarnessFingerprint !== current.benchmarkHarnessFingerprint) conflicts.push({ field: "benchmarkHarnessFingerprint", prior: prior.benchmarkHarnessFingerprint, current: current.benchmarkHarnessFingerprint });
  if (prior.productionArtifactFingerprint !== current.productionArtifactFingerprint) conflicts.push({ field: "productionArtifactFingerprint", prior: prior.productionArtifactFingerprint, current: current.productionArtifactFingerprint });
  if (prior.athenaFrozenCommit !== current.athenaFrozenCommit) conflicts.push({ field: "athenaFrozenCommit", prior: prior.athenaFrozenCommit, current: current.athenaFrozenCommit });
  if (prior.model !== current.model) conflicts.push({ field: "model", prior: prior.model, current: current.model });
  if (JSON.stringify(prior.modelConfig) !== JSON.stringify(current.modelConfig)) conflicts.push({ field: "modelConfig", prior: prior.modelConfig, current: current.modelConfig });
  if (prior.timeoutMs !== current.timeoutMs) conflicts.push({ field: "timeoutMs", prior: prior.timeoutMs, current: current.timeoutMs });
  if (prior.seed !== current.seed) conflicts.push({ field: "seed", prior: prior.seed, current: current.seed });
  if (JSON.stringify(prior.pairs) !== JSON.stringify(current.pairs)) conflicts.push({ field: "pairs", prior: prior.pairs?.length, current: current.pairs?.length });
  const priorCases = new Map((prior.cases ?? []).map((item) => [item.caseId, item]));
  const currentCases = new Map((current.cases ?? []).map((item) => [item.caseId, item]));
  for (const caseId of new Set([...priorCases.keys(), ...currentCases.keys()])) {
    const left = priorCases.get(caseId); const right = currentCases.get(caseId);
    if (!left || !right) { conflicts.push({ field: `cases.${caseId}`, prior: Boolean(left), current: Boolean(right) }); continue; }
    for (const field of ["fixtureFingerprint", "taskPromptHash", "caseDefinitionFingerprint", "requestedNetworkPolicy", "requestedTools", "dataset", "category"]) if (canonicalJson(left[field]) !== canonicalJson(right[field])) conflicts.push({ field: `cases.${caseId}.${field}`, prior: left[field], current: right[field] });
  }
  return { compatible: conflicts.length === 0, conflicts };
}
export function updateManifestRunStatus(manifest, runId, status) {
  const run = manifest.runs.find((item) => item.runId === runId);
  if (!run) throw new BenchmarkInfrastructureError(`manifest run absent: ${runId}`);
  run.status = status; return manifest;
}
export async function prepareExperiment({ experimentPlan, dryRun = false }) {
  if (!experimentPlan) throw new BenchmarkInfrastructureError("prepareExperiment requires pre-created experiment plan");
  if (experimentPlan.experimentId === "phase5b-held-out") {
    const { plan } = await loadPhase5BPlan();
    if (canonicalJson(plan) !== canonicalJson(experimentPlan)) {
      throw new BenchmarkInfrastructureError("Phase 5B execution must use the frozen preregistered run plan");
    }
    if (!dryRun) {
      const harnessManifest = JSON.parse(await readFile(join(benchRoot, "preregistration", "phase5b-harness.json"), "utf8"));
      await verifyPhase5BExecutionIdentity({ root, harnessManifest, runPlan: plan });
    }
  }
  const caseIds = [...new Set(experimentPlan.pairs.map((pair) => pair.caseId))];
  const caseDefinitions = await Promise.all(caseIds.map(loadCase));
  const differences = await assertFrozenProduction(!dryRun);
  const productionRuntime = await prepareFrozenRuntime();
  const harnessFingerprint = await benchmarkHarnessFingerprint();
  const benchmarkCommit = await git(["rev-parse", "HEAD"]);
  const cases = await Promise.all(caseDefinitions.map(async (caseDefinition) => ({ caseId: caseDefinition.id, fixture: caseDefinition.fixture, fixtureFingerprint: await fingerprintFixture(join(fixtureRoot, caseDefinition.fixture)), taskPromptHash: promptHash(caseDefinition.taskPrompt), caseDefinitionFingerprint: caseDefinitionFingerprint(caseDefinition), requestedNetworkPolicy: caseDefinition.requestedNetworkPolicy, requestedTools: caseDefinition.requestedTools, dataset: caseDefinition.dataset, category: caseDefinition.category })));
  const resultRoot = join(benchRoot, "results", experimentPlan.experimentId);
  await mkdir(join(resultRoot, "runs"), { recursive: true }); await mkdir(join(resultRoot, "raw"), { recursive: true });
  const manifestPath = join(resultRoot, "manifest.json");
  const prior = await readFile(manifestPath, "utf8").then(JSON.parse).catch(() => null);
  const current = { ...experimentPlan, benchmarkHarnessFingerprint: harnessFingerprint, productionArtifactFingerprint: productionRuntime.productionArtifactFingerprint, athenaFrozenCommit: FROZEN_ATHENA_COMMIT, cases };
  if (prior) { const compatibility = manifestCompatibility(prior, current); if (!compatibility.compatible) throw new BenchmarkInfrastructureError(`resume incompatible: manifest drift: ${compatibility.conflicts.map((conflict) => conflict.field).join(", ")}`); }
  const manifest = prior ?? experimentManifest({ plan: experimentPlan, benchmarkCommit, frozenProductionDifferences: differences, productionRuntime, benchmarkHarnessFingerprint: harnessFingerprint, cases });
  if (!prior) await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { caseDefinitions: new Map(caseDefinitions.map((item) => [item.id, item])), productionRuntime, harnessFingerprint, benchmarkCommit, resultRoot, manifestPath, manifest };
}
export async function runPair({ caseId, replicate = 1, timeoutMs, model = DEFAULT_MODEL, dryRun = false, preserve = false, experimentPlan, experimentSetup, confirmLive = false }) {
  if (!experimentPlan) throw new BenchmarkInfrastructureError("runPair requires pre-created experiment plan");
  if (!dryRun && !confirmLive) throw new BenchmarkInfrastructureError("runPair requires confirmLive: true for live execution");
  const setup = experimentSetup ?? await prepareExperiment({ experimentPlan, dryRun });
  const caseDefinition = setup.caseDefinitions.get(caseId);
  if (!caseDefinition) throw new BenchmarkInfrastructureError(`case absent from experiment plan: ${caseId}`);
  const effectiveTimeout = timeoutMs ?? caseDefinition.timeoutMs;
  const plan = experimentPlan;
  const pair = plan.pairs.find((item) => item.caseId === caseId && item.replicate === replicate);
  if (!pair) throw new Error(`Pair absent from experiment plan: replicate ${replicate}`);
  const { productionRuntime, harnessFingerprint, benchmarkCommit, resultRoot, manifestPath, manifest } = setup;
  const source = join(fixtureRoot, caseDefinition.fixture);
  const fingerprint = await fingerprintFixture(source);
  const version = dryRun ? "unverified-dry-run" : await hostVersion();
  const saveManifest = async () => writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const dockerSandbox = !dryRun && caseDefinition.requestedNetworkPolicy === "offline" ? await createDockerSandbox() : null;
  let frozenCoreModule = null;
  if (!dryRun) {
    if (!productionRuntime?.coreEntrypoint) throw new BenchmarkInfrastructureError("frozen core unavailable for treatment audit");
    try { frozenCoreModule = await import(pathToFileURL(productionRuntime.coreEntrypoint).href); }
    catch (error) { throw new BenchmarkInfrastructureError("frozen core unavailable for treatment audit", error); }
  }
  const completed = [];
  for (const arm of pair.order) {
    const plannedRun = pair.runs.find((run) => run.arm === arm);
    const runIdentity = { schemaVersion: RESULT_VERSION, experimentId: plan.experimentId, pairId: pair.pairId, arm, caseId, fixtureFingerprint: fingerprint, taskPromptHash: promptHash(caseDefinition.taskPrompt), caseDefinitionFingerprint: caseDefinitionFingerprint(caseDefinition), host: "OpenCode", hostVersion: version, model, modelConfig: plan.modelConfig, timeoutMs: effectiveTimeout, requestedNetworkPolicy: caseDefinition.requestedNetworkPolicy, requestedTools: caseDefinition.requestedTools, athenaFrozenCommit: FROZEN_ATHENA_COMMIT, productionArtifactFingerprint: productionRuntime.productionArtifactFingerprint, benchmarkHarnessFingerprint: harnessFingerprint, dataset: caseDefinition.dataset, category: caseDefinition.category, orderSeed: plan.seed, order: pair.order };
    const existing = findExistingRun(await existingRuns(resultRoot), plan.experimentId, pair.pairId, arm);
    if (existing) { validateResult(existing); assertResumeCompatible(existing, runIdentity); completed.push(existing); continue; }
    updateManifestRunStatus(manifest, plannedRun.runId, "running"); await saveManifest();
    const workRoot = await mkdtemp(join(homedir(), "athena-bench-work-"));
    const workspaceRoot = join(workRoot, "workspace");
    const hostConfigRoot = join(workRoot, "host-config");
    const athenaStateRoot = join(workRoot, "athena-state");
    const probeRoot = join(workRoot, "probe");
    await prepareArm({ caseDefinition, arm, workspaceRoot, hostConfigRoot, athenaStateRoot, probeRoot, productionRuntime });
    const { hostHome, shellHome } = await prepareHostHomes(workRoot);
    const runFingerprint = await fingerprintFixture(workspaceRoot);
    if (runFingerprint !== fingerprint) throw new Error(`Fixture fingerprint mismatch for ${arm}`);
    const modelVisibleFingerprint = await modelVisibleInputFingerprint(workspaceRoot);
    const baselineFiles = await capturePathStates(workspaceRoot, caseDefinition.validator.forbiddenPaths ?? []);
    const policyConfig = JSON.parse(await readFile(join(hostConfigRoot, "opencode.json"), "utf8"));
    const policyConfigFingerprint = sha256(JSON.stringify(policyConfig));
    const probe = join(probeRoot, "athena-plugin-probe.jsonl");
    await mkdir(probeRoot, { recursive: true });
    let networkVerified = false;
    let probeResult = null;
    let shellIsolation = null;
    if (!dryRun && caseDefinition.requestedNetworkPolicy === "offline") {
      if (!dockerSandbox) throw new BenchmarkInfrastructureError("offline network isolation unavailable: docker not available");
      probeResult = await probeDockerSandbox(dockerSandbox, workspaceRoot, athenaStateRoot, probeRoot, { ATHENA_BENCH_SHELL_HOME: shellHome, ATHENA_BENCH_WORK_ROOT: workRoot, ATHENA_BENCH_WORKSPACE_ROOT: workspaceRoot });
      networkVerified = probeResult.localProbePassed && probeResult.networkProbeBlocked && probeResult.hiddenStateProbePassed && probeResult.secretScrubProbePassed && !probeResult.dockerSocketMounted;
      shellIsolation = { backend: "docker", image: dockerSandbox.image, imageId: dockerSandbox.imageId, networkMode: "none", workspaceMounted: true, dockerSocketMounted: probeResult.dockerSocketMounted, localProbePassed: probeResult.localProbePassed, workspaceReadPassed: probeResult.workspaceReadPassed, workspaceWritePassed: probeResult.workspaceWritePassed, networkProbeBlocked: probeResult.networkProbeBlocked, hiddenStateProbePassed: probeResult.hiddenStateProbePassed, secretScrubProbePassed: probeResult.secretScrubProbePassed, verified: networkVerified, wrapperFingerprint: probeResult.wrapperFingerprint };
      if (!networkVerified) throw new BenchmarkInfrastructureError(`offline network isolation probe failed: ${JSON.stringify(probeResult)}`);
    }
    const shellEnv = { ...process.env, HOME: hostHome, OPENCODE_TEST_HOME: hostHome, OPENCODE_CONFIG: join(hostConfigRoot, "opencode.json"), OPENCODE_CONFIG_DIR: hostConfigRoot, ATHENA_BENCH_PLUGIN_PROBE: probe, OPENCODE_DISABLE_EXTERNAL_SKILLS: "1", OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "1", ATHENA_MODE: "balanced", ATHENA_BENCH_SHELL_HOME: shellHome, ATHENA_BENCH_WORK_ROOT: workRoot, ATHENA_BENCH_WORKSPACE_ROOT: workspaceRoot };
    if (dockerSandbox && caseDefinition.requestedNetworkPolicy === "offline") shellEnv.SHELL = dockerSandbox.wrapperPath;
    const startedAt = new Date().toISOString(); const started = Date.now();
    const execution = dryRun ? { code: 0, signal: null, timedOut: false, stdout: "", stderr: "" } : await executeAgent({ cwd: workspaceRoot, prompt: caseDefinition.taskPrompt, model, timeoutMs: effectiveTimeout, env: shellEnv });
    const host = parseHostTrace(execution.stdout, execution.stderr, { workdirRoot: workspaceRoot });
    const telemetry = await athenaTelemetry(arm === "treatment" ? athenaStateRoot : workspaceRoot);
    const pluginInstalled = arm === "treatment" ? await exists(join(hostConfigRoot, "plugins", "athena.ts")) : false;
    const activation = await pluginActivationEvidence(probe, pluginInstalled);
    const providerObserved = telemetry.jevCalls !== null || telemetry.jevFailures !== null;
    const observedToolNames = host.filter((r) => r.type === "action").map((r) => r.tool);
    const expectedPolicyConfigFingerprint = sha256(JSON.stringify(generateOpenCodeConfig(caseDefinition.requestedTools)));
    const toolIsolation = verifyToolIsolation({ requestedTools: caseDefinition.requestedTools, observedTools: observedToolNames, policyConfigFingerprint, expectedFingerprint: expectedPolicyConfigFingerprint });
    let stagnationDecisionAudit = [];
    let athenaConfig = null;
    if (arm === "treatment") {
      try { athenaConfig = JSON.parse(await readFile(join(athenaStateRoot, ".athena", "config.json"), "utf8")); }
      catch (error) { throw new BenchmarkInfrastructureError("treatment ATHENA config unavailable or malformed", error); }
      if (athenaConfig.mode !== "balanced") throw new BenchmarkInfrastructureError(`treatment ATHENA config mode must be balanced, got ${athenaConfig.mode}`);
      stagnationDecisionAudit = computeStagnationDecisionAudit({ events: telemetry.rawEvents ?? [], athenaConfig, coreModule: frozenCoreModule });
      if (stagnationDecisionAudit.length !== telemetry.metisEvaluations) throw new BenchmarkInfrastructureError("treatment stagnation audit incomplete");
    }
    const athenaArtifactsPresent = await exists(join(workspaceRoot, ".athena"));
    const benchmarkArtifactsPresent = await exists(join(workspaceRoot, ".opencode"));
    const modelVisibleEnv = { fingerprint: modelVisibleFingerprint, athenaArtifactsPresent, benchmarkArtifactsPresent, verifiedEquivalentInput: !athenaArtifactsPresent && !benchmarkArtifactsPresent };
    const runtimeEvidence = {
      athenaPluginInstalled: pluginInstalled, athenaPluginLocation: pluginInstalled ? "external-config-dir" : "none", modelVisibleAthenaArtifacts: modelVisibleEnv.athenaArtifactsPresent,
      athenaEventsFile: telemetry.active, hostAthenaEvidence: activation.active, athenaProvider: athenaConfig?.provider ?? null,
      pluginActivationEvidence: activation, providerCallVisibility: providerObserved ? "observed" : "unavailable",
      providerCalls: telemetry.jevCalls, providerFailures: telemetry.jevFailures, providerLatencyMs: providerObserved ? telemetry.jevLatencyMs : null,
      athenaAbsent: arm === "control" && !pluginInstalled && !telemetry.active && !activation.active,
      globalConfigurationIsolation: "OPENCODE_CONFIG_DIR with generated permission config; OPENCODE_TEST_HOME with copied OAuth auth; external skills disabled",
    };
    const validator = dryRun ? { success: false, evidence: [{ type: "dry-run" }] } : await validateRun({ fixtureRoot: source, runRoot: workspaceRoot, validator: caseDefinition.validator, baselineFiles });
    const trace = mergeTrace(host, telemetry.rawEvents, { workdirRoot: workspaceRoot });
    const actions = trace.filter((record) => record.type === "action");
    const hostData = hostMetrics(host);
    const durationMs = Date.now() - started;
    const networkIsolation = { requestedPolicy: caseDefinition.requestedNetworkPolicy, mechanism: dockerSandbox ? "docker" : "none", wrapperFingerprint: dockerSandbox ? sha256(await readFile(dockerSandbox.wrapperPath, "utf8")) : null, localProbePassed: probeResult?.localProbePassed ?? null, networkProbeBlocked: probeResult?.networkProbeBlocked ?? null, usableExternalRoutePresent: probeResult?.usableExternalRoutePresent ?? null, verified: networkVerified };
    const result = {
      schemaVersion: RESULT_VERSION, experimentId: plan.experimentId, pairId: pair.pairId, runId: plannedRun.runId, caseId, arm,
      status: execution.timedOut ? "timeout" : execution.code === 0 ? "completed" : "failed",
      benchmarkCommit, athenaFrozenCommit: FROZEN_ATHENA_COMMIT, productionArtifactFingerprint: productionRuntime.productionArtifactFingerprint,
      productionRuntime: productionRuntime.provenance, host: "OpenCode", hostVersion: version, model, modelConfig: plan.modelConfig,
      fixtureFingerprint: runFingerprint, taskPromptHash: promptHash(caseDefinition.taskPrompt), caseDefinitionFingerprint: caseDefinitionFingerprint(caseDefinition),
      timeoutMs: effectiveTimeout, requestedTools: caseDefinition.requestedTools, requestedNetworkPolicy: caseDefinition.requestedNetworkPolicy,
      benchmarkHarnessFingerprint: harnessFingerprint, dataset: caseDefinition.dataset, category: caseDefinition.category, orderSeed: plan.seed, order: pair.order,
      startedAt, finishedAt: new Date().toISOString(), durationMs,
      termination: { timedOut: execution.timedOut, terminationSignal: execution.terminationSignal ?? null, forcedKill: execution.forcedKill ?? false },
      metrics: { taskSuccess: validator.success, timeToSolutionMs: validator.success ? durationMs : null, toolCalls: actions.length, llmTurns: hostData.llmTurns, meaningfulActions: actions.filter((a) => a.category !== "read").length, failedToolCalls: actions.filter((a) => a.success === false).length, completionStatus: execution.timedOut ? "timeout" : execution.code === 0 ? "agent-exited" : "agent-failed", prematureCompletion: completionDeclaration(host, validator.success), dangerousActionProposed: null, dangerousActionExecuted: null, dangerousActionBlocked: null, ...hostData },
      validator: JSON.parse(redact(JSON.stringify(validator), { workdirRoot: workspaceRoot })),
      runtimeEvidence, athenaTelemetrySummary: { ...telemetry, rawEvents: undefined },
      environmentMetadata: {
        requestedNetworkPolicy: caseDefinition.requestedNetworkPolicy, networkIsolationVerified: networkVerified,
        requestedTools: caseDefinition.requestedTools, toolsIsolationVerified: toolIsolation.verified, orderSeed: plan.seed, order: pair.order,
        modelVisibleInputFingerprint: modelVisibleFingerprint, modelVisibleEnvironment: modelVisibleEnv,
        toolIsolation, networkIsolation, shellIsolation, stagnationDecisionAudit,
      },
    };
    validateResult(result);
    await writeFile(join(resultRoot, "runs", `${result.runId}.json`), `${JSON.stringify(result, null, 2)}\n`);
    updateManifestRunStatus(manifest, plannedRun.runId, result.status); await saveManifest();
    await writeFile(join(resultRoot, "raw", `${result.runId}.jsonl`), trace.map((record) => JSON.stringify(record)).join("\n") + (trace.length ? "\n" : ""));
    completed.push(result);
    if (!preserve) await rm(workRoot, { recursive: true, force: true });
  }
  if (dockerSandbox) await rm(dockerSandbox.wrapperDir, { recursive: true, force: true }).catch(() => {});
  const validity = validatePair(completed);
  await writeFile(join(resultRoot, `summary-${pair.pairId}.json`), `${JSON.stringify({ pairId: pair.pairId, ...validity, productionRuntime: productionRuntime.provenance, runs: completed.map((run) => run.runId) }, null, 2)}\n`);
  return { experimentId: plan.experimentId, pairId: pair.pairId, ...validity, runs: completed };
}
