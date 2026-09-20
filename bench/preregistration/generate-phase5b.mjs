import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  R3_HARNESS_FINGERPRINT,
  createPhase5BPlan,
  fingerprintHeldoutCorpus,
} from "./phase5b-integrity.mjs";

// eslint-disable-next-line no-undef
const root = process.cwd();
const benchRoot = join(root, "bench");
const casesDir = join(benchRoot, "cases");
const fixturesDir = join(root, "evals", "fixtures");
const validatorsDir = join(benchRoot, "validators", "heldout");
const preregistrationDir = join(benchRoot, "preregistration");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

async function files(rootDir, prefix = "") {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const output = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if ([".git", ".athena", ".opencode", "node_modules"].includes(entry.name)) continue;
    const path = join(rootDir, entry.name);
    if (entry.isDirectory()) output.push(...await files(path, join(prefix, entry.name)));
    else output.push({ path, logicalPath: join(prefix, entry.name) });
  }
  return output;
}

async function fixtureFingerprint(fixture) {
  const hash = createHash("sha256");
  for (const file of await files(join(fixturesDir, fixture))) {
    hash.update(file.logicalPath);
    hash.update("\0");
    hash.update(await readFile(file.path));
    hash.update("\0");
  }
  return hash.digest("hex");
}

const caseFiles = (await readdir(casesDir)).filter((file) => /^lp-\d\d\.json$/.test(file)).sort();
const cases = await Promise.all(caseFiles.map(async (file) => JSON.parse(await readFile(join(casesDir, file), "utf8"))));
const heldoutCorpusFingerprint = await fingerprintHeldoutCorpus({ casesDir, fixturesDir, validatorsDir });
const corpus = {
  schemaVersion: "1.0",
  heldoutCorpusFingerprint,
  totalTasks: cases.length,
  categories: Object.fromEntries([...new Set(cases.map((item) => item.category))].sort().map((category) => [category, cases.filter((item) => item.category === category).length])),
  cases: await Promise.all(cases.map(async (caseDefinition) => ({
    caseId: caseDefinition.id,
    caseDefinitionFingerprint: sha256(JSON.stringify(caseDefinition)),
    fixtureFingerprint: await fixtureFingerprint(caseDefinition.fixture),
    taskPromptHash: sha256(caseDefinition.taskPrompt),
  }))),
};
const plan = createPhase5BPlan({ seed: 42, corpusFingerprint: heldoutCorpusFingerprint });
const harness = {
  schemaVersion: "1.0",
  r3BaselineCommit: "c8b294e56c36d39042fd2b7a89009bca9e8bb4ea",
  r3BaselineHarnessFingerprint: R3_HARNESS_FINGERPRINT,
  phase5bExecutionCommit: null,
  phase5bExecutionHarnessFingerprint: null,
  heldoutCorpusFingerprint: null,
  phase5bRunPlanFingerprint: null,
  frozenAthenaCommit: "f7f157a452901153ad98763ecfc610bd0b5803b5",
  dockerImage: "athena-bench-shell:latest",
  dockerImageId: "sha256:53c63250fce11b423bcfaaff06378cd115b37c8974bc9c9d8839d144ff36c098",
  openCodeVersion: "1.18.31",
  model: "openai/gpt-5.6-terra",
  timeoutMs: 300000,
};
await Promise.all([
  writeFile(join(preregistrationDir, "phase5b-corpus.json"), `${JSON.stringify(corpus, null, 2)}\n`),
  writeFile(join(preregistrationDir, "phase5b-run-plan.json"), `${JSON.stringify(plan, null, 2)}\n`),
  writeFile(join(preregistrationDir, "phase5b-harness.json"), `${JSON.stringify(harness, null, 2)}\n`),
]);
