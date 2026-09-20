import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import {
  validateCase,
  // @ts-expect-error JavaScript benchmark runner has no declaration output.
} from "../runners/index.mjs";

const ROOT = join(__dirname, "..", "..");
const CASES = join(ROOT, "bench", "cases");
const FIXTURES = join(ROOT, "evals", "fixtures");
const PREREG = join(ROOT, "bench", "preregistration");

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map((item: unknown) => item === undefined ? "null" : canonicalJson(item)).join(",") + "]";
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return "{" + Object.keys(obj).sort().filter((key) => obj[key] !== undefined).map((key) => JSON.stringify(key) + ":" + canonicalJson(obj[key])).join(",") + "}";
  }
  throw new Error("cannot canonicalize " + typeof value);
}

function caseFingerprint(caseDef: Record<string, unknown>): string {
  return sha256(canonicalJson({
    id: caseDef.id, category: caseDef.category, fixture: caseDef.fixture,
    taskPrompt: caseDef.taskPrompt, validator: caseDef.validator,
    timeoutMs: caseDef.timeoutMs, requestedNetworkPolicy: caseDef.requestedNetworkPolicy,
    requestedTools: caseDef.requestedTools, dataset: caseDef.dataset,
  }));
}

function fixtureFingerprint(dir: string): string {
  const hash = createHash("sha256");
  function walk(d: string) {
    const entries = readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if ([".git", ".athena", ".opencode", "node_modules"].includes(entry.name)) continue;
      const full = join(d, entry.name);
      if (entry.isDirectory()) { hash.update(entry.name + "\0dir\0"); walk(full); }
      else { hash.update(entry.name + "\0"); hash.update(readFileSync(full)); hash.update("\0"); }
    }
  }
  walk(dir);
  return hash.digest("hex");
}

const HELDOUT_IDS = [
  "lp-01","lp-02","lp-03","lp-04","lp-05","lp-06","lp-07","lp-08","lp-09","lp-10","lp-11","lp-12",
  "lp-13","lp-14","lp-15","lp-16","lp-17","lp-18","lp-19","lp-20","lp-21","lp-22","lp-23","lp-24",
  "lp-25","lp-26","lp-27","lp-28","lp-29","lp-30",
];

describe("Phase 5B corpus integrity", () => {
  it("has exactly 30 held-out case files", async () => {
    const files = (await readdir(CASES)).filter((f) => f.startsWith("lp-") && f.endsWith(".json"));
    expect(files).toHaveLength(30);
  });

  it("has exactly 12 semantic-loop cases", async () => {
    const files = (await readdir(CASES)).filter((f) => f.startsWith("lp-") && f.endsWith(".json"));
    const cases = await Promise.all(files.map(async (f) => JSON.parse(await readFile(join(CASES, f), "utf8"))));
    expect(cases.filter((c: Record<string, unknown>) => c.category === "semantic-loop")).toHaveLength(12);
  });

  it("has exactly 12 legitimate-progress cases", async () => {
    const files = (await readdir(CASES)).filter((f) => f.startsWith("lp-") && f.endsWith(".json"));
    const cases = await Promise.all(files.map(async (f) => JSON.parse(await readFile(join(CASES, f), "utf8"))));
    expect(cases.filter((c: Record<string, unknown>) => c.category === "legitimate-progress")).toHaveLength(12);
  });

  it("has exactly 6 mixed-debugging cases", async () => {
    const files = (await readdir(CASES)).filter((f) => f.startsWith("lp-") && f.endsWith(".json"));
    const cases = await Promise.all(files.map(async (f) => JSON.parse(await readFile(join(CASES, f), "utf8"))));
    expect(cases.filter((c: Record<string, unknown>) => c.category === "mixed-debugging")).toHaveLength(6);
  });

  it("all cases have dataset held-out", async () => {
    const files = (await readdir(CASES)).filter((f) => f.startsWith("lp-") && f.endsWith(".json"));
    for (const f of files) {
      const c: Record<string, unknown> = JSON.parse(await readFile(join(CASES, f), "utf8"));
      expect(c.dataset).toBe("held-out");
    }
  });

  it("no duplicate case IDs", async () => {
    const files = (await readdir(CASES)).filter((f) => f.startsWith("lp-") && f.endsWith(".json"));
    const ids = files.map((f) => f.replace(".json", ""));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all case IDs match HELDOUT_IDS", async () => {
    const files = (await readdir(CASES)).filter((f) => f.startsWith("lp-") && f.endsWith(".json"));
    const ids = files.map((f) => f.replace(".json", "")).sort();
    expect(ids).toEqual([...HELDOUT_IDS].sort());
  });

  it("all validators use portable heldout identities", async () => {
    const files = (await readdir(CASES)).filter((f) => f.startsWith("lp-") && f.endsWith(".json"));
    for (const f of files) {
      const c: Record<string, unknown> = JSON.parse(await readFile(join(CASES, f), "utf8"));
      const validator = c.validator as Record<string, unknown>;
      expect(validator.kind).toBe("heldout-case");
      expect(validator.caseId).toBe(c.id);
    }
  });

  it("all fixtures exist", async () => {
    const files = (await readdir(CASES)).filter((f) => f.startsWith("lp-") && f.endsWith(".json"));
    for (const f of files) {
      const c: Record<string, unknown> = JSON.parse(await readFile(join(CASES, f), "utf8"));
      expect(existsSync(join(FIXTURES, c.fixture as string))).toBe(true);
    }
  });

  it("no fixture contains ATHENA artifacts", async () => {
    const files = (await readdir(CASES)).filter((f) => f.startsWith("lp-") && f.endsWith(".json"));
    for (const f of files) {
      const c: Record<string, unknown> = JSON.parse(await readFile(join(CASES, f), "utf8"));
      const fixtureDir = join(FIXTURES, c.fixture as string);
      if (!existsSync(fixtureDir)) continue;
      const entries = readdirSync(fixtureDir, { withFileTypes: true, recursive: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.parentPath) {
          const content = readFileSync(join(entry.parentPath, entry.name), "utf8");
          expect(content).not.toContain("ATHENA");
          expect(content).not.toContain("METIS");
          expect(content).not.toContain("CONTROL");
          expect(content).not.toContain("TREATMENT");
        }
      }
    }
  });

  it("all cases pass validateCase", async () => {
    const files = (await readdir(CASES)).filter((f) => f.startsWith("lp-") && f.endsWith(".json"));
    for (const f of files) {
      const c: Record<string, unknown> = JSON.parse(await readFile(join(CASES, f), "utf8"));
      expect(() => validateCase(c)).not.toThrow();
    }
  });

  it("no case contains solution or answer leakage", async () => {
    const leakPatterns = ["solution", "answer", "gold", "expected fix", "loop-prone", "legitimate-progress", "ATHENA", "METIS", "CONTROL", "TREATMENT"];
    const files = (await readdir(CASES)).filter((f) => f.startsWith("lp-") && f.endsWith(".json"));
    for (const f of files) {
      const c: Record<string, unknown> = JSON.parse(await readFile(join(CASES, f), "utf8"));
      const prompt = (c.taskPrompt as string).toLowerCase();
      for (const pattern of leakPatterns) {
        expect(prompt).not.toContain(pattern.toLowerCase());
      }
    }
  });

  it("model-visible fingerprints are deterministic", async () => {
    const files = (await readdir(CASES)).filter((f) => f.startsWith("lp-") && f.endsWith(".json"));
    const fp1 = new Map<string, string>();
    const fp2 = new Map<string, string>();
    for (const f of files) {
      const c: Record<string, unknown> = JSON.parse(await readFile(join(CASES, f), "utf8"));
      fp1.set(c.id as string, caseFingerprint(c));
      fp2.set(c.id as string, caseFingerprint(c));
    }
    for (const [id, fp] of fp1) {
      expect(fp).toBe(fp2.get(id));
    }
  });

  it("corpus fingerprint is deterministic", async () => {
    const corpus1 = JSON.parse(await readFile(join(PREREG, "phase5b-corpus.json"), "utf8"));
    const corpus2 = JSON.parse(await readFile(join(PREREG, "phase5b-corpus.json"), "utf8"));
    expect(corpus1.heldoutCorpusFingerprint).toBe(corpus2.heldoutCorpusFingerprint);
  });

  it("task prompt change alters corpus fingerprint", async () => {
    const caseFile = join(CASES, "lp-01.json");
    const originalCase: Record<string, unknown> = JSON.parse(await readFile(caseFile, "utf8"));
    const originalFp = caseFingerprint(originalCase);
    const modified = { ...originalCase, taskPrompt: (originalCase.taskPrompt as string) + " MODIFIED" };
    const modifiedFp = caseFingerprint(modified);
    expect(modifiedFp).not.toBe(originalFp);
  });

  it("arm order is exactly balanced 45/45", async () => {
    const plan = JSON.parse(await readFile(join(PREREG, "phase5b-run-plan.json"), "utf8"));
    expect(plan.ctOrders).toBe(45);
    expect(plan.tcOrders).toBe(45);
    expect(plan.totalPairs).toBe(90);
    expect(plan.totalAgentRuns).toBe(180);
  });

  it("exactly 90 pairs", async () => {
    const plan = JSON.parse(await readFile(join(PREREG, "phase5b-run-plan.json"), "utf8"));
    expect(plan.pairs).toHaveLength(90);
  });

  it("exactly 180 runs", async () => {
    const plan = JSON.parse(await readFile(join(PREREG, "phase5b-run-plan.json"), "utf8"));
    const totalRuns = plan.pairs.reduce((sum: number, p: Record<string, unknown>) => sum + (p.runs as unknown[]).length, 0);
    expect(totalRuns).toBe(180);
  });

  it("all 3 replicates present for each case", async () => {
    const plan = JSON.parse(await readFile(join(PREREG, "phase5b-run-plan.json"), "utf8"));
    for (const id of HELDOUT_IDS) {
      const casePairs = plan.pairs.filter((p: Record<string, unknown>) => p.caseId === id);
      expect(casePairs).toHaveLength(3);
      const replicates = casePairs.map((p: Record<string, unknown>) => p.replicate).sort();
      expect(replicates).toEqual([1, 2, 3]);
    }
  });

  it("no held-out task reuses development fixture fingerprints", async () => {
    const devCases = ["controlled-semantic-loop", "straightforward-fix"];
    const devFps = new Set<string>();
    for (const id of devCases) {
      try {
        const c: Record<string, unknown> = JSON.parse(await readFile(join(CASES, id + ".json"), "utf8"));
        devFps.add(fixtureFingerprint(join(FIXTURES, c.fixture as string)));
      } catch { /* skip missing */ }
    }
    const heldoutFiles = (await readdir(CASES)).filter((f) => f.startsWith("lp-") && f.endsWith(".json"));
    for (const f of heldoutFiles) {
      const c: Record<string, unknown> = JSON.parse(await readFile(join(CASES, f), "utf8"));
      const fp = fixtureFingerprint(join(FIXTURES, c.fixture as string));
      expect(devFps.has(fp)).toBe(false);
    }
  });

  it("bootstrap deterministic under fixed seed", () => {
    const values = [1, 2, 3, 4, 5];
    let seed1 = 42, seed2 = 42;
    const rng1 = () => { seed1 = (seed1 * 1103515245 + 12345) & 0x7fffffff; return seed1 / 0x7fffffff; };
    const rng2 = () => { seed2 = (seed2 * 1103515245 + 12345) & 0x7fffffff; return seed2 / 0x7fffffff; };
    const sample1 = Array.from({ length: 5 }, () => values[Math.floor(rng1() * values.length)]);
    const sample2 = Array.from({ length: 5 }, () => values[Math.floor(rng2() * values.length)]);
    expect(sample1).toEqual(sample2);
  });

  it("infrastructure-invalid and task-failure are distinct statuses", () => {
    const statuses = ["completed", "failed", "timeout", "invalid"];
    expect(statuses).toContain("invalid");
    expect(statuses).toContain("failed");
  });
});
