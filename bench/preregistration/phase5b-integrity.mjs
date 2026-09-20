import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export const PHASE5B_CASE_IDS = Array.from({ length: 30 }, (_, index) => `lp-${String(index + 1).padStart(2, "0")}`);
export const PHASE5B_MAX_PAIRS = 90;
export const PHASE5B_MAX_AGENT_RUNS = 180;
export const R3_HARNESS_FINGERPRINT = "518935b9504b1ca26474e96b402df8b8cfb2db8b8b8c9a220fcc5239309ea008";

export function canonicalJson(value) {
  if (value === null || ["boolean", "number", "string"].includes(typeof value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  throw new TypeError(`Cannot canonicalize ${typeof value}`);
}

async function sortedFiles(root, prefix = "") {
  const entries = await readdir(root, { withFileTypes: true });
  const output = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if ([".git", ".athena", ".opencode", "node_modules", "dist"].includes(entry.name)) continue;
    const path = join(root, entry.name);
    const logicalPath = join(prefix, entry.name);
    if (entry.isDirectory()) output.push(...await sortedFiles(path, logicalPath));
    else output.push({ path, logicalPath });
  }
  return output;
}

async function contentRecords(root) {
  return Promise.all((await sortedFiles(root)).map(async ({ path, logicalPath }) => ({
    path: logicalPath,
    content: await readFile(path, "utf8"),
  })));
}

export async function fingerprintHeldoutCorpus({ casesDir, fixturesDir, validatorsDir }) {
  const caseFiles = (await readdir(casesDir)).filter((name) => /^lp-\d\d\.json$/.test(name)).sort();
  const cases = [];
  const fixtures = [];
  for (const name of caseFiles) {
    const value = JSON.parse(await readFile(join(casesDir, name), "utf8"));
    cases.push({ path: name, value });
    fixtures.push({ caseId: value.id, files: await contentRecords(join(fixturesDir, value.fixture)) });
  }
  const validators = await contentRecords(validatorsDir);
  const canonical = canonicalJson({
    cases,
    fixtures: fixtures.sort((left, right) => left.caseId.localeCompare(right.caseId)),
    validators,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export function fingerprintPhase5BRunPlan(plan) {
  return createHash("sha256").update(canonicalJson(plan)).digest("hex");
}

export function planSequencingDiagnostics(pairs) {
  const orders = pairs.map((pair) => pair.order.join("-"));
  let transitions = 0;
  let longestSameOrderStreak = 0;
  let currentStreak = 0;
  let previous = null;
  for (const order of orders) {
    currentStreak = order === previous ? currentStreak + 1 : 1;
    if (previous !== null && order !== previous) transitions++;
    longestSameOrderStreak = Math.max(longestSameOrderStreak, currentStreak);
    previous = order;
  }
  return { ctTcTransitions: transitions, longestSameOrderStreak };
}

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shuffle(items, seed) {
  const rng = random(seed);
  return shuffleWithRandom(items, rng);
}

function shuffleWithRandom(items, rng) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(rng() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function createPhase5BPlan({ seed, corpusFingerprint, model = "openai/gpt-5.6-terra", timeoutMs = 300000 }) {
  const descriptors = PHASE5B_CASE_IDS.flatMap((caseId) => [1, 2, 3].map((replicate) => ({ caseId, replicate })));
  const shuffled = shuffle(descriptors, seed);
  const rng = random(seed ^ 0x9e3779b9);
  const armOrders = Array.from({ length: 15 }, () => shuffleWithRandom([
    ["control", "treatment"], ["control", "treatment"], ["control", "treatment"],
    ["treatment", "control"], ["treatment", "control"], ["treatment", "control"],
  ], rng)).flat();
  const pairs = shuffled.map(({ caseId, replicate }, index) => {
    const pairId = `phase5b-${caseId}-r${String(replicate).padStart(2, "0")}`;
    const order = armOrders[index];
    return {
      pairId,
      caseId,
      replicate,
      order,
      runs: order.map((arm) => ({ runId: `${pairId}-${arm}`, arm, status: "pending" })),
    };
  });
  const diagnostics = planSequencingDiagnostics(pairs);
  return {
    schemaVersion: "1.0",
    experimentId: "phase5b-held-out",
    seed,
    replicates: 3,
    totalPairs: pairs.length,
    totalAgentRuns: pairs.length * 2,
    ctOrders: pairs.filter((pair) => pair.order[0] === "control").length,
    tcOrders: pairs.filter((pair) => pair.order[0] === "treatment").length,
    corpusFingerprint,
    r3HarnessFingerprint: R3_HARNESS_FINGERPRINT,
    model,
    timeoutMs,
    sequencing: diagnostics,
    pairs,
  };
}

export function validatePhase5BPlan(plan, { corpusFingerprint, harnessFingerprint = R3_HARNESS_FINGERPRINT }) {
  const reasons = [];
  if (plan?.schemaVersion !== "1.0") reasons.push("unsupported plan schemaVersion");
  if (plan?.experimentId !== "phase5b-held-out") reasons.push("unexpected experimentId");
  if (plan?.seed !== 42) reasons.push("plan seed must be 42");
  if (plan?.model !== "openai/gpt-5.6-terra") reasons.push("plan model mismatch");
  if (plan?.timeoutMs !== 300000) reasons.push("plan timeout mismatch");
  if (plan?.replicates !== 3) reasons.push("plan replicates mismatch");
  if (plan?.corpusFingerprint !== corpusFingerprint) reasons.push("heldout corpus fingerprint mismatch");
  if (plan?.r3HarnessFingerprint !== harnessFingerprint) reasons.push("R3 harness fingerprint mismatch");
  if (plan?.totalPairs !== PHASE5B_MAX_PAIRS || plan?.pairs?.length !== PHASE5B_MAX_PAIRS) reasons.push("plan must contain exactly 90 pairs");
  if (plan?.totalAgentRuns !== PHASE5B_MAX_AGENT_RUNS) reasons.push("plan must contain exactly 180 runs");
  if (plan?.ctOrders !== 45 || plan?.tcOrders !== 45) reasons.push("plan must contain exactly 45 CT and 45 TC pairs");
  const pairIds = new Set();
  const runIds = new Set();
  const replicatesByCase = new Map();
  for (const pair of plan?.pairs ?? []) {
    if (!PHASE5B_CASE_IDS.includes(pair.caseId)) reasons.push(`unknown case ID: ${pair.caseId}`);
    if (!/^phase5b-lp-\d\d-r0[123]$/.test(pair.pairId ?? "")) reasons.push(`invalid pair ID: ${pair.pairId}`);
    if (pairIds.has(pair.pairId)) reasons.push(`duplicate pair ID: ${pair.pairId}`);
    pairIds.add(pair.pairId);
    if (![1, 2, 3].includes(pair.replicate)) reasons.push(`invalid replicate: ${pair.pairId}`);
    if (JSON.stringify(pair.order) !== JSON.stringify(["control", "treatment"]) && JSON.stringify(pair.order) !== JSON.stringify(["treatment", "control"])) reasons.push(`invalid arm order: ${pair.pairId}`);
    if (pair.runs?.length !== 2) reasons.push(`invalid run count: ${pair.pairId}`);
    for (const arm of pair.order ?? []) {
      const run = pair.runs?.find((candidate) => candidate.arm === arm);
      if (!run || run.runId !== `${pair.pairId}-${arm}`) reasons.push(`invalid run ID: ${pair.pairId}:${arm}`);
      if (runIds.has(run?.runId)) reasons.push(`duplicate run ID: ${run?.runId}`);
      runIds.add(run?.runId);
    }
    const replicates = replicatesByCase.get(pair.caseId) ?? new Set();
    replicates.add(pair.replicate);
    replicatesByCase.set(pair.caseId, replicates);
  }
  if (pairIds.size !== 90) reasons.push("pair IDs are not unique");
  if (runIds.size !== 180) reasons.push("run IDs are not unique");
  for (const caseId of PHASE5B_CASE_IDS) {
    if (replicatesByCase.get(caseId)?.size !== 3) reasons.push(`case ${caseId} does not have exactly three replicates`);
  }
  const diagnostics = planSequencingDiagnostics(plan?.pairs ?? []);
  if (plan?.sequencing?.ctTcTransitions !== diagnostics.ctTcTransitions || plan?.sequencing?.longestSameOrderStreak !== diagnostics.longestSameOrderStreak) reasons.push("plan sequencing diagnostics mismatch");
  return { valid: reasons.length === 0, reasons, diagnostics };
}
