/* global process */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fingerprintHeldoutCorpus, fingerprintPhase5BRunPlan } from "./phase5b-integrity.mjs";
const EXECUTION_DIRECTORIES = ["bench/runners", "bench/validators", "bench/schema"];

async function files(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const output = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) output.push(...await files(path));
    else if ([".mjs", ".json"].some((extension) => entry.name.endsWith(extension))) output.push(path);
  }
  return output;
}

export async function phase5BExecutionHarnessFingerprint(root = process.cwd()) {
  const hash = createHash("sha256");
  for (const directory of EXECUTION_DIRECTORIES) {
    for (const file of await files(join(root, directory))) {
      hash.update(relative(root, file));
      hash.update("\0");
      hash.update(await readFile(file));
      hash.update("\0");
    }
  }
  return hash.digest("hex");
}

export async function verifyPhase5BExecutionIdentity({ root = process.cwd(), harnessManifest, runPlan }) {
  const currentFingerprint = await phase5BExecutionHarnessFingerprint(root);
  const corpusFingerprint = await fingerprintHeldoutCorpus({
    casesDir: join(root, "bench", "cases"),
    fixturesDir: join(root, "evals", "fixtures"),
    validatorsDir: join(root, "bench", "validators", "heldout"),
  });
  const runPlanFingerprint = fingerprintPhase5BRunPlan(runPlan);
  if (!harnessManifest.phase5bExecutionHarnessFingerprint || !harnessManifest.heldoutCorpusFingerprint || !harnessManifest.phase5bRunPlanFingerprint) throw new Error("Phase 5B scientific identity is unfrozen");
  if (currentFingerprint !== harnessManifest.phase5bExecutionHarnessFingerprint) throw new Error("Phase 5B execution harness fingerprint mismatch");
  if (corpusFingerprint !== harnessManifest.heldoutCorpusFingerprint) throw new Error("Phase 5B heldout corpus fingerprint mismatch");
  if (runPlanFingerprint !== harnessManifest.phase5bRunPlanFingerprint) throw new Error("Phase 5B run plan fingerprint mismatch");
  return { currentFingerprint, corpusFingerprint, runPlanFingerprint };
}
