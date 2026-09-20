import { describe, expect, it } from "vitest";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  capturePathStates,
  pathState,
  validateRun,
  // @ts-expect-error JavaScript validator has no declaration output.
} from "../validators/index.mjs";
import {
  assertExperimentBudget,
  dryPhase5BPlan,
  loadPhase5BPlan,
  planExperiment,
  // @ts-expect-error Benchmark runner is JavaScript-only.
} from "../runners/index.mjs";
import {
  PHASE5B_CASE_IDS,
  R3_HARNESS_FINGERPRINT,
  createPhase5BPlan,
  fingerprintHeldoutCorpus,
  fingerprintPhase5BRunPlan,
  validatePhase5BPlan,
  // @ts-expect-error JavaScript preregistration module has no declaration output.
} from "../preregistration/phase5b-integrity.mjs";

const ROOT = join(__dirname, "..", "..");
const CASES = join(ROOT, "bench", "cases");
const FIXTURES = join(ROOT, "evals", "fixtures");
const PREREGISTRATION = join(ROOT, "bench", "preregistration");
type PlannedRun = { runId: string; arm: string };
type PlannedPair = { pairId: string; caseId: string; replicate: number; order: string[]; runs: PlannedRun[] };
type PlannedExperiment = { totalPairs: number; totalAgentRuns: number; ctOrders: number; tcOrders: number; pairs: PlannedPair[] };

async function caseDefinition(id: string) {
  return JSON.parse(await readFile(join(CASES, `${id}.json`), "utf8"));
}

async function validateCaseThroughRealPath(id: string, runRoot = join(FIXTURES, id)) {
  const definition = await caseDefinition(id);
  const baselineFiles = await capturePathStates(runRoot, definition.validator.forbiddenPaths);
  return validateRun({ fixtureRoot: join(FIXTURES, id), runRoot, validator: definition.validator, baselineFiles });
}

async function syntheticCorpus(reverse = false) {
  const root = await mkdtemp(join(tmpdir(), "phase5b-corpus-"));
  const casesDir = join(root, "cases");
  const fixturesDir = join(root, "fixtures");
  const validatorsDir = join(root, "validators");
  await Promise.all([mkdir(casesDir), mkdir(fixturesDir), mkdir(validatorsDir)]);
  const operations = [
    () => writeFile(join(casesDir, "lp-01.json"), JSON.stringify({ id: "lp-01", fixture: "lp-01", taskPrompt: "prompt" })),
    async () => { await mkdir(join(fixturesDir, "lp-01")); await writeFile(join(fixturesDir, "lp-01", "source.js"), "module.exports = 1;\n"); },
    () => writeFile(join(validatorsDir, "validate-case.mjs"), "export default 1;\n"),
    () => writeFile(join(validatorsDir, "helper.mjs"), "export const helper = true;\n"),
  ];
  for (const operation of reverse ? [...operations].reverse() : operations) await operation();
  return { root, casesDir, fixturesDir, validatorsDir };
}

describe("Phase 5B Pass A execution integrity", () => {
  it("accepts the frozen 90-pair / 180-run budget and rejects overages", () => {
    expect(assertExperimentBudget({ pairs: 90, agentRuns: 180, maxPairs: 90, maxAgentRuns: 180 })).toMatchObject({ pairs: 90, agentRuns: 180 });
    expect(() => assertExperimentBudget({ pairs: 91, agentRuns: 180, maxPairs: 90, maxAgentRuns: 180 })).toThrow("Run budget exceeded");
    expect(() => assertExperimentBudget({ pairs: 90, agentRuns: 181, maxPairs: 90, maxAgentRuns: 180 })).toThrow("Run budget exceeded");
  });

  it("uses Phase 5B budget only when explicitly requested", () => {
    const definition = { id: "lp-01" };
    expect(planExperiment({ caseDefinitions: Array.from({ length: 30 }, (_, index) => ({ ...definition, id: `lp-${index}` })), replicates: 3, seed: 42, model: "model", timeoutMs: 1_000, experimentId: "phase5b-held-out", experimentMode: "phase5b" }).agentRuns).toBe(180);
    expect(() => planExperiment({ caseDefinitions: Array.from({ length: 30 }, (_, index) => ({ ...definition, id: `lp-${index}` })), replicates: 3, seed: 42, model: "model", timeoutMs: 1_000, experimentId: "other" })).toThrow("Run budget exceeded");
  });

  it("loads exact frozen plan with 45/45 balance, unique identities, and three replicates", async () => {
    const { plan } = await loadPhase5BPlan() as { plan: PlannedExperiment };
    expect(plan.totalPairs).toBe(90);
    expect(plan.totalAgentRuns).toBe(180);
    expect(plan.ctOrders).toBe(45);
    expect(plan.tcOrders).toBe(45);
    expect(new Set(plan.pairs.map((pair: PlannedPair) => pair.pairId)).size).toBe(90);
    expect(new Set(plan.pairs.flatMap((pair: PlannedPair) => pair.runs.map((run: PlannedRun) => run.runId))).size).toBe(180);
    for (const id of PHASE5B_CASE_IDS) expect(plan.pairs.filter((pair: PlannedPair) => pair.caseId === id)).toHaveLength(3);
  });

  it("creates deterministic interleaved ordering from recorded seed", async () => {
    const manifest = JSON.parse(await readFile(join(PREREGISTRATION, "phase5b-corpus.json"), "utf8"));
    const first = createPhase5BPlan({ seed: 42, corpusFingerprint: manifest.heldoutCorpusFingerprint });
    const second = createPhase5BPlan({ seed: 42, corpusFingerprint: manifest.heldoutCorpusFingerprint });
    expect(first).toEqual(second);
    expect(first.sequencing.ctTcTransitions).toBeGreaterThan(0);
    expect(first.sequencing.longestSameOrderStreak).toBeLessThanOrEqual(6);
    expect(first.sequencing.longestSameOrderStreak).toBeGreaterThan(1);
  });

  it("rejects a frozen run plan with a corpus or harness mismatch", async () => {
    const { plan, corpusFingerprint } = await loadPhase5BPlan();
    expect(validatePhase5BPlan({ ...plan, corpusFingerprint: "0".repeat(64) }, { corpusFingerprint, harnessFingerprint: R3_HARNESS_FINGERPRINT }).valid).toBe(false);
    expect(validatePhase5BPlan({ ...plan, r3HarnessFingerprint: "0".repeat(64) }, { corpusFingerprint, harnessFingerprint: R3_HARNESS_FINGERPRINT }).valid).toBe(false);
  });

  it("aborts plan loading when frozen corpus manifest mismatches source", async () => {
    const root = await mkdtemp(join(tmpdir(), "phase5b-manifest-"));
    const manifestPath = join(root, "phase5b-corpus.json");
    await writeFile(manifestPath, JSON.stringify({ heldoutCorpusFingerprint: "0".repeat(64) }));
    await expect(loadPhase5BPlan({ corpusManifestPath: manifestPath })).rejects.toThrow("corpus manifest fingerprint mismatch");
    await rm(root, { recursive: true, force: true });
  });

  it("aborts plan loading when frozen harness manifest mismatches R3", async () => {
    const root = await mkdtemp(join(tmpdir(), "phase5b-harness-"));
    const harnessManifestPath = join(root, "phase5b-harness.json");
    await writeFile(harnessManifestPath, JSON.stringify({ benchmarkHarnessFingerprint: "0".repeat(64) }));
    await expect(loadPhase5BPlan({ harnessManifestPath })).rejects.toThrow("harness manifest fingerprint mismatch");
    await rm(root, { recursive: true, force: true });
  });

  it("runs heldout validation through real benchmark validation path", async () => {
    const result = await validateCaseThroughRealPath("lp-01");
    expect(result.success).toBe(false);
    expect(result.evidence).toContainEqual(expect.objectContaining({ type: "heldout-validator-sandbox", caseId: "lp-01", workspaceMount: "read-only" }));
  });

  it("rejects unknown validator placeholders", async () => {
    const result = await validateRun({ fixtureRoot: FIXTURES, runRoot: FIXTURES, validator: { kind: "command", command: ["node", "{unknown}"], expectedExit: 0 }, baselineFiles: new Map() });
    expect(result.success).toBe(false);
    expect(result.evidence).toContainEqual(expect.objectContaining({ type: "command-interpolation", rejected: true }));
  });

  it("rejects all 30 unfixed fixtures through real validation path", async () => {
    const results = await Promise.all(PHASE5B_CASE_IDS.map((id: string) => validateCaseThroughRealPath(id)));
    expect(results.filter((result: { success: boolean }) => !result.success)).toHaveLength(30);
  }, 60_000);

  it("does not accept editing visible tests without fixing source", async () => {
    const root = await mkdtemp(join(tmpdir(), "phase5b-cheat-"));
    const cases = [
      { id: "lp-01", test: "test-parser.js" },
      { id: "lp-06", test: "test-emitter.js" },
      { id: "lp-24", test: "test-email.js" },
    ];
    const results = [];
    for (const item of cases) {
      const workspace = join(root, item.id);
      await cp(join(FIXTURES, item.id), workspace, { recursive: true });
      await writeFile(join(workspace, item.test), "console.log('PASS');\n");
      results.push(await validateCaseThroughRealPath(item.id, workspace));
    }
    await rm(root, { recursive: true, force: true });
    expect(results.every((result: { success: boolean }) => !result.success)).toBe(true);
  });

  it("recomputes a stable corpus fingerprint from source contents", async () => {
    const corpus = await syntheticCorpus();
    const original = await fingerprintHeldoutCorpus(corpus);
    expect(await fingerprintHeldoutCorpus(corpus)).toBe(original);
    await writeFile(join(corpus.casesDir, "lp-01.json"), JSON.stringify({ id: "lp-01", fixture: "lp-01", taskPrompt: "changed" }));
    expect(await fingerprintHeldoutCorpus(corpus)).not.toBe(original);
    await rm(corpus.root, { recursive: true, force: true });
  });

  it("changes corpus fingerprint for fixture and validator mutation", async () => {
    const corpus = await syntheticCorpus();
    const original = await fingerprintHeldoutCorpus(corpus);
    await writeFile(join(corpus.fixturesDir, "lp-01", "source.js"), "module.exports = 2;\n");
    expect(await fingerprintHeldoutCorpus(corpus)).not.toBe(original);
    await writeFile(join(corpus.fixturesDir, "lp-01", "source.js"), "module.exports = 1;\n");
    await writeFile(join(corpus.validatorsDir, "validate-case.mjs"), "export default 2;\n");
    expect(await fingerprintHeldoutCorpus(corpus)).not.toBe(original);
    await rm(corpus.root, { recursive: true, force: true });
  });

  it("fingerprint ignores traversal creation order and detects file additions", async () => {
    const first = await syntheticCorpus(false);
    const second = await syntheticCorpus(true);
    const firstFingerprint = await fingerprintHeldoutCorpus(first);
    expect(await fingerprintHeldoutCorpus(second)).toBe(firstFingerprint);
    await writeFile(join(second.validatorsDir, "extra.mjs"), "export default 3;\n");
    expect(await fingerprintHeldoutCorpus(second)).not.toBe(firstFingerprint);
    await Promise.all([rm(first.root, { recursive: true, force: true }), rm(second.root, { recursive: true, force: true })]);
  });

  it("run-plan fingerprint uses canonical JSON, not whitespace", () => {
    const first = { seed: 42, pairs: [{ pairId: "phase5b-lp-01-r01", order: ["control", "treatment"] }] };
    const second = JSON.parse('{\n  "pairs": [{"order":["control","treatment"],"pairId":"phase5b-lp-01-r01"}], "seed": 42\n}');
    expect(fingerprintPhase5BRunPlan(first)).toBe(fingerprintPhase5BRunPlan(second));
    expect(fingerprintPhase5BRunPlan({ ...first, pairs: [{ ...first.pairs[0], order: ["treatment", "control"] }] })).not.toBe(fingerprintPhase5BRunPlan(first));
  });

  it("dry plan performs no model execution", async () => {
    await expect(dryPhase5BPlan()).resolves.toMatchObject({ cases: 30, replicates: 3, pairs: 90, runs: 180, ct: 45, tc: 45, openCodeProcesses: 0, gptCalls: 0, jevCalls: 0 });
  });

  it("detects protected file and directory state changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "phase5b-protected-"));
    expect(await pathState(root, ".opencode")).toEqual({ kind: "absent" });
    await writeFile(join(root, ".opencode"), "one");
    const file = await pathState(root, ".opencode");
    await writeFile(join(root, ".opencode"), "two");
    expect(await pathState(root, ".opencode")).not.toEqual(file);
    await rm(join(root, ".opencode"));
    await mkdir(join(root, ".opencode"));
    await writeFile(join(root, ".opencode", "state.json"), "one");
    const directory = await pathState(root, ".opencode");
    await writeFile(join(root, ".opencode", "state.json"), "two");
    expect(await pathState(root, ".opencode")).not.toEqual(directory);
    await rm(root, { recursive: true, force: true });
  });
});
