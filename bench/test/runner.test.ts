import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, symlink, writeFile, chmod, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  FROZEN_ATHENA_COMMIT,
  assertFrozenProduction,
  assertFrozenRuntimeGraph,
  assertResumeCompatible,
  benchmarkHarnessFingerprint,
  completionDeclaration,
  executeProcess,
  finalAssistantMessage,
  findExistingRun,
  experimentManifest,
  fingerprintFixture,
  fingerprintProductionArtifacts,
  hostMetrics,
  mergeTrace,
  orderedArms,
  parseHostTrace,
  planExperiment,
  prepareArm,
  promptHash,
  redact,
  runKey,
  resumeCompatibility,
  updateManifestRunStatus,
  validateCase,
  validatePair,
  validateResult,
  // @ts-expect-error JavaScript benchmark runner has no declaration output.
} from "../runners/index.mjs";
// @ts-expect-error JavaScript benchmark analysis has no declaration output.
import { analyzeRuns, median } from "../analysis/summary.mjs";

const sampleCase = {
  id: "fixture",
  title: "Fixture",
  category: "test-fix",
  description: "Test",
  fixture: "fixture",
  taskPrompt: "Test",
  validator: { kind: "file-present", path: "proof.md" },
  timeoutMs: 1000,
  expectedBehavior: "Test",
  tags: [],
  difficulty: "easy",
  requestedNetworkPolicy: "offline",
  requestedTools: ["read"],
  dataset: "development",
};
const exec = promisify(execFile);

async function writeRuntimePackage(root: string, name: string, source: string) {
  const packageRoot = join(root, "packages", name);
  await mkdir(join(packageRoot, "dist"), { recursive: true });
  await writeFile(
    join(packageRoot, "package.json"),
    JSON.stringify({
      name: `@athena/${name}`,
      type: "module",
      exports: "./dist/index.js",
    }),
  );
  await writeFile(join(packageRoot, "dist", "index.js"), source);
}

async function frozenRuntime(root: string, reverseFiles = false) {
  await writeRuntimePackage(root, "core", 'export const runtime = "FROZEN";\n');
  await writeRuntimePackage(
    root,
    "typesafe",
    'import { runtime } from "@athena/core"; export const typesafeRuntime = runtime;\n',
  );
  await writeRuntimePackage(
    root,
    "opencode",
    'import { runtime } from "@athena/core"; import { typesafeRuntime } from "@athena/typesafe"; export const AthenaV1Plugin = () => ({ runtime, typesafeRuntime });\n',
  );
  const files = reverseFiles ? ["z.js", "a.js"] : ["a.js", "z.js"];
  for (const file of files)
    await writeFile(join(root, "packages", "opencode", "dist", file), file);
  await mkdir(join(root, "packages", "typesafe", "node_modules", "@athena"), {
    recursive: true,
  });
  await mkdir(join(root, "packages", "opencode", "node_modules", "@athena"), {
    recursive: true,
  });
  await symlink(
    join(root, "packages", "core"),
    join(root, "packages", "typesafe", "node_modules", "@athena", "core"),
  );
  await symlink(
    join(root, "packages", "core"),
    join(root, "packages", "opencode", "node_modules", "@athena", "core"),
  );
  await symlink(
    join(root, "packages", "typesafe"),
    join(root, "packages", "opencode", "node_modules", "@athena", "typesafe"),
  );
  return join(root, "packages", "opencode", "dist", "index.js");
}

async function loadFrozenPlugin(entrypoint: string) {
  const moduleUrl = pathToFileURL(entrypoint).href;
  const { stdout } = await exec(process.execPath, [
    "--input-type=module",
    "--eval",
    `const runtime = await import(${JSON.stringify(moduleUrl)}); process.stdout.write(JSON.stringify(runtime.AthenaV1Plugin()));`,
  ]);
  return JSON.parse(stdout);
}

const result = (arm: "control" | "treatment", pairId = "fixture-r01") => ({
  schemaVersion: "1.1",
  experimentId: "experiment",
  pairId,
  runId: `${pairId}-${arm}`,
  caseId: "fixture",
  arm,
  status: "completed",
  benchmarkCommit: "a",
  athenaFrozenCommit: FROZEN_ATHENA_COMMIT,
  productionArtifactFingerprint: "c".repeat(64),
  productionRuntime: {
    frozenCommit: FROZEN_ATHENA_COMMIT,
    artifactFingerprint: "c".repeat(64),
    buildSource: "git-commit",
    artifactRoot: "athena-bench-frozen/frozen/build",
  },
  host: "OpenCode",
  hostVersion: "1.18.31",
  model: "openai/gpt-5.6-terra",
  modelConfig: { model: "openai/gpt-5.6-terra", seedControl: "unsupported" },
  fixtureFingerprint: "a".repeat(64),
  taskPromptHash: "b".repeat(64),
  caseDefinitionFingerprint: "e".repeat(64),
  timeoutMs: 1000,
  requestedTools: ["read"],
  requestedNetworkPolicy: "offline",
  benchmarkHarnessFingerprint: "d".repeat(64),
  dataset: "development",
  category: "test-fix",
  orderSeed: 1,
  order: ["control", "treatment"],
  startedAt: "now",
  finishedAt: "now",
  durationMs: arm === "control" ? 10 : 20,
  termination: { timedOut: false, terminationSignal: null, forcedKill: false },
  metrics: {
    taskSuccess: true,
    toolCalls: arm === "control" ? 2 : 4,
    llmTurns: 1,
    failedToolCalls: 0,
    prematureCompletion: null,
  },
  validator: { success: true, evidence: [] },
  runtimeEvidence: {
    athenaAbsent: arm === "control",
    localAthenaPlugin: false,
    athenaEventsFile: false,
    hostAthenaEvidence: false,
    providerCallVisibility: "unavailable",
    providerCalls: null,
    providerFailures: null,
    providerLatencyMs: null,
  },
  athenaTelemetrySummary: {
    active: arm === "treatment",
    replan: 0,
    reflexCompleted: 0,
    jevCalls: null,
  },
  environmentMetadata: {
    requestedNetworkPolicy: "offline",
    networkIsolationVerified: false,
    requestedTools: ["read"],
    toolsIsolationVerified: false,
    orderSeed: 1,
    order: ["control", "treatment"],
  },
});

describe("benchmark harness", () => {
  it("strictly validates case and result schemas", () => {
    expect(validateCase(sampleCase).id).toBe("fixture");
    expect(() =>
      validateCase({ ...sampleCase, category: "unknown" }),
    ).toThrow();
    expect(() =>
      validateCase({ ...sampleCase, validator: { kind: "command" } }),
    ).toThrow();
    expect(validateResult(result("control")).arm).toBe("control");
    expect(() =>
      validateResult({ ...result("control"), athenaFrozenCommit: "wrong" }),
    ).toThrow();
  });

  it("allows benchmark-only freeze state and blocks production differences", async () => {
    await expect(assertFrozenProduction(true, [])).resolves.toEqual([]);
    await expect(
      assertFrozenProduction(true, ["packages/core/src/index.ts"]),
    ).rejects.toThrow(FROZEN_ATHENA_COMMIT);
  });

  it("plans all replicate pairs under one experiment identifier", () => {
    const plan = planExperiment({
      caseDefinition: sampleCase,
      replicates: 2,
      seed: 7,
      model: "openai/gpt-5.6-terra",
      timeoutMs: 1000,
      experimentId: "one-experiment",
    });
    expect(plan.experimentId).toBe("one-experiment");
    expect(plan.agentRuns).toBe(4);
    expect(plan.pairs.map((pair: { pairId: string }) => pair.pairId)).toEqual([
      "fixture-r01",
      "fixture-r02",
    ]);
    expect(
      new Set([
        runKey("fixture-r01", "control"),
        runKey("fixture-r01", "treatment"),
        runKey("fixture-r02", "control"),
        runKey("fixture-r02", "treatment"),
      ]).size,
    ).toBe(4);
    const runs = [
      result("control", "fixture-r01"),
      result("treatment", "fixture-r01"),
      result("control", "fixture-r02"),
      result("treatment", "fixture-r02"),
    ];
    expect(findExistingRun(runs, "experiment", "fixture-r02", "control")?.runId).toBe(
      "fixture-r02-control",
    );
    expect(() =>
      planExperiment({
        caseDefinition: sampleCase,
        replicates: 11,
        seed: 1,
        model: "x",
        timeoutMs: 1000,
        experimentId: "too-many",
      }),
    ).toThrow("Run budget");
  });

  it("creates six unique planned runs for three replicates", () => {
    const plan = planExperiment({ caseDefinition: sampleCase, replicates: 3, seed: 7, model: "m", timeoutMs: 1000, experimentId: "one" });
    expect(new Set(plan.pairs.map((pair: { pairId: string }) => pair.pairId)).size).toBe(3);
    const runs = plan.pairs.flatMap((pair: { runs: Array<{ runId: string }> }) => pair.runs);
    expect(new Set(runs.map((run: { runId: string }) => run.runId)).size).toBe(6);
    expect(runs.map((run: { runId: string }) => run.runId)).toEqual(["fixture-r01-control", "fixture-r01-treatment", "fixture-r02-treatment", "fixture-r02-control", "fixture-r03-control", "fixture-r03-treatment"]);
  });

  it("fingerprints only behavior-relevant harness files", async () => {
    const root = await mkdtemp(join(tmpdir(), "athena-bench-harness-"));
    for (const directory of ["runners", "validators", "schema", "analysis", "results"]) await mkdir(join(root, directory), { recursive: true });
    await writeFile(join(root, "runners", "index.mjs"), "export const runner = 1;\n");
    await writeFile(join(root, "validators", "index.mjs"), "export const validator = 1;\n");
    const fingerprint = await benchmarkHarnessFingerprint(root);
    expect(await benchmarkHarnessFingerprint(root)).toBe(fingerprint);
    const reordered = await mkdtemp(join(tmpdir(), "athena-bench-harness-"));
    await mkdir(join(reordered, "validators"), { recursive: true });
    await mkdir(join(reordered, "runners"), { recursive: true });
    await writeFile(join(reordered, "validators", "index.mjs"), "export const validator = 1;\n");
    await writeFile(join(reordered, "runners", "index.mjs"), "export const runner = 1;\n");
    expect(await benchmarkHarnessFingerprint(reordered)).toBe(fingerprint);
    await writeFile(join(root, "README.md"), "docs changed\n");
    await writeFile(join(root, "results", "run.json"), "generated\n");
    expect(await benchmarkHarnessFingerprint(root)).toBe(fingerprint);
    await writeFile(join(root, "runners", "index.mjs"), "export const runner = 2;\n");
    expect(await benchmarkHarnessFingerprint(root)).not.toBe(fingerprint);
  });

  it("preserves full manifest plan through status updates", () => {
    const secondCase = { ...sampleCase, id: "fixture-two" };
    const plan = planExperiment({ caseDefinitions: [sampleCase, secondCase], replicates: 2, seed: 1, model: "m", timeoutMs: 1000, experimentId: "manifest" });
    const manifest = experimentManifest({ plan, benchmarkCommit: "a", frozenProductionDifferences: [], benchmarkHarnessFingerprint: "d".repeat(64), productionRuntime: { productionArtifactFingerprint: "c".repeat(64), provenance: result("control").productionRuntime }, cases: [] });
    expect(manifest.pairs).toHaveLength(4);
    expect(manifest.runs).toHaveLength(8);
    expect(manifest.runs.every((run: { status: string }) => run.status === "pending")).toBe(true);
    updateManifestRunStatus(manifest, manifest.runs[0].runId, "completed");
    expect(manifest.runs).toHaveLength(8);
    expect(manifest.runs[0].status).toBe("completed");
  });

  it("rejects incompatible completed runs with structured conflicts", () => {
    const stored = result("control");
    const compatibility = resumeCompatibility(stored, { ...stored, fixtureFingerprint: "e".repeat(64) });
    expect(compatibility.resumeCompatible).toBe(false);
    expect(compatibility.fields[0].field).toBe("fixtureFingerprint");
    expect(() => assertResumeCompatible(stored, { ...stored, benchmarkHarnessFingerprint: "e".repeat(64) })).toThrow("benchmarkHarnessFingerprint");
    expect(resumeCompatibility({ ...stored, benchmarkHarnessFingerprint: undefined }, stored).reason).toBe("missing benchmarkHarnessFingerprint");
  });

  it("rejects resume when fixture path stays constant but content changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "athena-bench-fixture-"));
    await writeFile(join(root, "fixture.txt"), "first");
    const stored = { ...result("control"), fixtureFingerprint: await fingerprintFixture(root) };
    await writeFile(join(root, "fixture.txt"), "second");
    const compatibility = resumeCompatibility(stored, { ...stored, fixtureFingerprint: await fingerprintFixture(root) });
    expect(compatibility.resumeCompatible).toBe(false);
    expect(compatibility.fields).toEqual(expect.arrayContaining([expect.objectContaining({ field: "fixtureFingerprint" })]));
  });

  it("rejects incompatible resume definitions", () => {
    expect(() =>
      assertResumeCompatible(result("control"), { ...result("control"), model: "other" }),
    ).toThrow("model");
    expect(() => assertResumeCompatible(result("control"), result("control"))).not.toThrow();
  });

  it("fingerprints isolated fixtures and installs ATHENA only for treatment", async () => {
    const root = await mkdtemp(join(tmpdir(), "athena-bench-"));
    const entrypoint = await frozenRuntime(join(root, "frozen"));
    await mkdir(join(root, "a"));
    await mkdir(join(root, "b"));
    await writeFile(join(root, "a", "fixture.txt"), "same");
    await writeFile(join(root, "b", "fixture.txt"), "same");
    expect(await fingerprintFixture(join(root, "a"))).toBe(
      await fingerprintFixture(join(root, "b")),
    );
    const control = join(root, "control");
    const treatment = join(root, "treatment");
    await prepareArm({
      caseDefinition: { fixture: "controlled-semantic-loop" },
      arm: "control",
      target: control,
    });
    await prepareArm({
      caseDefinition: { fixture: "controlled-semantic-loop" },
      arm: "treatment",
      target: treatment,
      productionRuntime: { entrypoint },
    });
    await expect(
      readFile(join(control, ".opencode", "plugins", "athena.ts"), "utf8"),
    ).rejects.toThrow();
    expect(
      await readFile(
        join(treatment, ".opencode", "plugins", "athena.ts"),
        "utf8",
      ),
    ).toContain("AthenaV1Plugin");
  });

  it("terminates a hanging harmless child after timeout", async () => {
    const execution = await executeProcess({ command: process.execPath, args: ["--eval", "setInterval(() => {}, 1000)"], cwd: process.cwd(), timeoutMs: 20, env: process.env });
    expect(execution.timedOut).toBe(true);
    expect(execution.terminationSignal).toBe("SIGTERM");
    expect(execution.forcedKill).toBe(false);
  });

  it("uses frozen runtime after working-tree dist tampering", async () => {
    const root = await mkdtemp(join(tmpdir(), "athena-bench-provenance-"));
    const artifactRoot = join(root, "frozen");
    const entrypoint = await frozenRuntime(artifactRoot);
    const fingerprint = await fingerprintProductionArtifacts(artifactRoot);
    const productionRuntime = {
      entrypoint,
      productionArtifactFingerprint: fingerprint,
      provenance: {
        frozenCommit: FROZEN_ATHENA_COMMIT,
        artifactFingerprint: fingerprint,
        buildSource: "git-commit",
        artifactRoot: `athena-bench-frozen/${FROZEN_ATHENA_COMMIT}/build`,
      },
    };
    const currentDist = join(
      root,
      "current-working-tree",
      "packages",
      "opencode",
      "dist",
    );
    await mkdir(currentDist, { recursive: true });
    await writeFile(
      join(currentDist, "index.js"),
      'throw new Error("CURRENT DIST EXECUTED");\n',
    );
    const treatment = join(root, "treatment");
    await prepareArm({
      caseDefinition: { fixture: "controlled-semantic-loop" },
      arm: "treatment",
      target: treatment,
      productionRuntime,
    });
    const plugin = await readFile(
      join(treatment, ".opencode", "plugins", "athena.ts"),
      "utf8",
    );
    expect(plugin).toContain(pathToFileURL(entrypoint).href);
    expect((await loadFrozenPlugin(entrypoint)).runtime).toBe("FROZEN");
    expect(await fingerprintProductionArtifacts(artifactRoot)).toBe(fingerprint);
  });

  it("isolates frozen internal ATHENA dependencies from current production packages", async () => {
    const root = await mkdtemp(join(tmpdir(), "athena-bench-graph-"));
    const artifactRoot = join(root, "frozen");
    const entrypoint = await frozenRuntime(artifactRoot);
    const currentCore = join(
      root,
      "current-working-tree",
      "packages",
      "core",
      "dist",
    );
    await mkdir(currentCore, { recursive: true });
    await writeFile(
      join(currentCore, "index.js"),
      'export const runtime = "CURRENT_SENTINEL";\n',
    );
    await expect(assertFrozenRuntimeGraph(artifactRoot)).resolves.toBe(
      entrypoint,
    );
    expect(await loadFrozenPlugin(entrypoint)).toEqual({
      runtime: "FROZEN",
      typesafeRuntime: "FROZEN",
    });
  });

  it("fingerprints production artifacts deterministically and ignores benchmark files", async () => {
    const root = await mkdtemp(join(tmpdir(), "athena-bench-fingerprint-"));
    const first = join(root, "first");
    const second = join(root, "second");
    await frozenRuntime(first);
    await frozenRuntime(second, true);
    const firstFingerprint = await fingerprintProductionArtifacts(first);
    expect(firstFingerprint).toBe(await fingerprintProductionArtifacts(first));
    expect(firstFingerprint).toBe(await fingerprintProductionArtifacts(second));
    await mkdir(join(first, "bench"), { recursive: true });
    await writeFile(join(first, "bench", "only.txt"), "changed");
    expect(await fingerprintProductionArtifacts(first)).toBe(firstFingerprint);
    await writeFile(
      join(first, "packages", "core", "dist", "index.js"),
      'export const runtime = "CHANGED";\n',
    );
    expect(await fingerprintProductionArtifacts(first)).not.toBe(
      firstFingerprint,
    );
  });

  it("parses sanitized real OpenCode 1.18.31 capture", async () => {
    const stream = await readFile(
      join(process.cwd(), "bench/test/fixtures/opencode-1.18.31-real.jsonl"),
      "utf8",
    );
    const trace = parseHostTrace(stream) as Array<{
      toolCallID?: string;
      type: string;
      success?: boolean | null;
      error?: string | null;
      [key: string]: unknown;
    }>;
    const completed = trace.find(
      (record) => record.toolCallID === "call_completed",
    );
    const failed = trace.find((record) => record.toolCallID === "call_error");
    expect(completed).toMatchObject({
      sessionID: "ses_sanitized",
      messageID: "msg_assistant_1",
      tool: "bash",
      stateStatus: "completed",
      input: '{"command":"pnpm test","workdir":"$WORKDIR"}',
      result: "Tests: 1 passed",
      success: true,
    });
    expect(failed).toMatchObject({
      messageID: "msg_assistant_2",
      stateStatus: "error",
      success: false,
    });
    expect(failed?.error).toContain("sanitized failure");
    expect(
      trace.filter(
        (record) => record.type === "action" && record.success === false,
      ),
    ).toHaveLength(1);
    expect(hostMetrics(trace)).toEqual({
      sessionID: "ses_sanitized",
      llmTurns: 2,
      hostTokens: {
        total: 41898,
        input: 21745,
        output: 162,
        reasoning: 23,
        cacheRead: 19968,
        cacheWrite: 0,
      },
      hostReportedCost: 0,
    });
    expect(finalAssistantMessage(trace)).toBe("Completed review.");
    expect(completionDeclaration(trace, false)).toBe(true);
    expect(completionDeclaration(trace, true)).toBe(false);
  });

  it("merges host and ATHENA trace chronologically", () => {
    const merged = mergeTrace(
      [
        {
          source: "host",
          order: 0,
          timestamp: 1,
          type: "action",
          tool: "bash",
        },
        {
          source: "host",
          order: 1,
          timestamp: 4,
          type: "action",
          tool: "read",
        },
      ],
      [
        { timestamp: "1970-01-01T00:00:00.002Z", type: "REFLEX_COMPLETED" },
        { timestamp: "1970-01-01T00:00:00.003Z", type: "REPLAN_QUEUED" },
      ],
    );
    expect(
      merged.map((entry: { type: string; event?: { type: string } }) =>
        entry.type === "athena-event" ? entry.event?.type : entry.type,
      ),
    ).toEqual(["action", "REFLEX_COMPLETED", "REPLAN_QUEUED", "action"]);
  });

  it("classifies only final completion declarations", () => {
    expect(
      completionDeclaration(
        [
          { type: "host-output", summary: "fixed incidental text" },
          {
            type: "assistant-text",
            messageID: "final",
            order: 1,
            text: "I investigated.",
          },
        ],
        false,
      ),
    ).toBe(false);
    expect(
      completionDeclaration(
        [
          {
            type: "assistant-text",
            messageID: "final",
            order: 1,
            text: "Fixed the task.",
          },
        ],
        false,
      ),
    ).toBe(true);
    expect(completionDeclaration([], false)).toBeNull();
  });

  it("redacts JSON secrets and sanitizes paths", () => {
    const value = redact(
      '{"token":"secret","api_key":"secret","Authorization":"Bearer secret"} /home/martins/Documents/athena-jev/x',
    );
    expect(value).not.toContain("secret");
    expect(value).toContain("[REDACTED]");
    expect(value).toContain("$REPO");
  });

  it("validates pairs and excludes invalid pairs from analysis", () => {
    const validRuns = [
      result("control", "fixture-r01"),
      result("treatment", "fixture-r01"),
    ];
    const invalidRuns = [
      result("control", "fixture-r02"),
      {
        ...result("treatment", "fixture-r02"),
        athenaTelemetrySummary: {
          active: false,
          replan: 0,
          reflexCompleted: 0,
          jevCalls: null,
        },
      },
    ];
    expect(validatePair(validRuns).pairValid).toBe(true);
    const failedRuns = validRuns.map((run) => ({
      ...run,
      metrics: { ...run.metrics, taskSuccess: false },
    }));
    expect(validatePair(failedRuns).pairValid).toBe(true);
    expect(validatePair(invalidRuns).invalidReasons).toContain(
      "treatment ATHENA inactive",
    );
    expect(
      validatePair([
        { ...result("control"), runtimeEvidence: { athenaAbsent: false } },
        result("treatment"),
      ]).invalidReasons,
    ).toContain("control ATHENA absence not verified");
    const analysis = analyzeRuns([...validRuns, ...invalidRuns]);
    expect(analysis.control.n).toBe(1);
    expect(analysis.invalidPairs).toHaveLength(1);
    expect(median([1, 3, 5, 7])).toBe(4);
  });

  it("counterbalances deterministic order", () => {
    expect(orderedArms(7, 1)).not.toEqual(orderedArms(7, 2));
    expect(promptHash("x")).toBe(promptHash("x"));
  });

  it("rejects budgets exceeding hard limits", () => {
    expect(() =>
      planExperiment({
        caseDefinition: sampleCase,
        replicates: 10,
        seed: 1,
        model: "m",
        timeoutMs: 1000,
        experimentId: "max-ok",
      }),
    ).not.toThrow();
    expect(() =>
      planExperiment({
        caseDefinition: sampleCase,
        replicates: 11,
        seed: 1,
        model: "m",
        timeoutMs: 1000,
        experimentId: "over",
      }),
    ).toThrow("Run budget");
  });

  it("computes correct medians ignoring null entries", () => {
    expect(median([1])).toBe(1);
    expect(median([1, 3])).toBe(2);
    expect(median([1, 2, 9])).toBe(2);
    expect(median([1, 2, 8, 10])).toBe(5);
    expect(median([])).toBeNull();
    expect(median([null as unknown as number])).toBeNull();
  });

  it("redacts absolute paths using contextual roots", () => {
    const ctx = {
      repoRoot: "/home/example/Documents/athena-jev",
      homeRoot: "/home/example",
      workdirRoot: "/tmp/custom-random-123/session-root",
    };
    expect(redact("/home/example/Documents/athena-jev/foo", ctx)).toBe(
      "$REPO/foo",
    );
    expect(redact("/home/example/.config/opencode", ctx)).toBe(
      "$HOME/.config/opencode",
    );
    expect(
      redact("/tmp/custom-random-123/session-root/file.txt", ctx),
    ).toBe("$WORKDIR/file.txt");
    expect(redact("/tmp/unrelated-temp/other/file.txt", ctx)).toBe(
      "/tmp/unrelated-temp/other/file.txt",
    );
    expect(redact("/home/otheruser/.config/file.json", ctx)).toBe(
      "/home/otheruser/.config/file.json",
    );
  });

  it("falls back to default repo/home roots without context", () => {
    expect(redact("/home/martins/Documents/athena-jev/x")).toContain("$REPO");
    expect(redact("/home/martins/.config/opencode/auth.json")).toContain(
      "$HOME",
    );
  });

  it("redacts secrets from JSON and header forms", () => {
    const json =
      '{"token":"super-secret-token","api_key":"fake-api-key","Authorization":"Bearer fake-bearer"}';
    expect(redact(json)).not.toContain("super-secret-token");
    expect(redact(json)).not.toContain("fake-api-key");
    expect(redact(json)).not.toContain("fake-bearer");
    expect(redact(json)).toContain("[REDACTED]");
    expect(redact("token=secret123")).not.toContain("secret123");
    expect(redact("api_key=secret456")).not.toContain("secret456");
    expect(redact("Authorization: Bearer fake-bearer-2")).not.toContain(
      "fake-bearer-2",
    );
    expect(redact("apiKey=secret789")).not.toContain("secret789");
  });

  it("excludes malformed results from analysis headline statistics", () => {
    const good = [
      result("control", "fixture-r01"),
      result("treatment", "fixture-r01"),
    ];
    const malformed = {
      schemaVersion: "1.1",
      experimentId: "experiment",
      pairId: "fixture-r02",
      runId: "fixture-r02-control",
      caseId: "fixture",
      arm: "control",
      status: "completed",
      benchmarkCommit: "a",
      athenaFrozenCommit: FROZEN_ATHENA_COMMIT,
      productionArtifactFingerprint: "c".repeat(64),
      benchmarkHarnessFingerprint: "d".repeat(64),
    };
    const analysis = analyzeRuns([...good, malformed as unknown as ReturnType<typeof result>]);
    expect(analysis.control.n).toBe(1);
    expect(analysis.artifactValidationErrors).toHaveLength(1);
    expect(analysis.artifactValidationErrors[0].runId).toBe(
      "fixture-r02-control",
    );
  });

  it("excludes analysis from invalid pairs while preserving them", () => {
    const valid = [
      result("control", "fixture-r01"),
      result("treatment", "fixture-r01"),
    ];
    const invalid = [
      result("control", "fixture-r02"),
      {
        ...result("treatment", "fixture-r02"),
        athenaTelemetrySummary: {
          active: false,
          replan: 0,
          reflexCompleted: 0,
          jevCalls: null,
        },
      },
    ];
    const analysis = analyzeRuns([...valid, ...invalid]);
    expect(analysis.control.n).toBe(1);
    expect(analysis.invalidPairs).toHaveLength(1);
  });

  it("does not overwrite previous invalid results on resume", () => {
    expect(
      resumeCompatibility(
        { ...result("control"), fixtureFingerprint: "a".repeat(64) },
        { ...result("control"), fixtureFingerprint: "b".repeat(64) },
      ).resumeCompatible,
    ).toBe(false);
  });

  it("malformed artifact sharing valid pairId cannot affect summary", () => {
    const valid = [
      result("control", "fixture-r01"),
      result("treatment", "fixture-r01"),
    ];
    const malformed = {
      ...result("control", "fixture-r01"),
      metrics: undefined,
    };
    const analysis = analyzeRuns([...valid, malformed as unknown as ReturnType<typeof result>]);
    expect(analysis.control.n).toBe(1);
    expect(analysis.artifactValidationErrors).toHaveLength(1);
    expect(analysis.control.successRate).toBe(1);
  });

  it("completely missing planned pair remains reported", () => {
    const plan = {
      pairs: [
        { pairId: "fixture-r01", runs: [{ runId: "fixture-r01-control", arm: "control" }, { runId: "fixture-r01-treatment", arm: "treatment" }] },
        { pairId: "fixture-r02", runs: [{ runId: "fixture-r02-control", arm: "control" }, { runId: "fixture-r02-treatment", arm: "treatment" }] },
      ],
    };
    const runs = [result("control", "fixture-r01"), result("treatment", "fixture-r01")];
    const analysis = analyzeRuns(runs, plan);
    expect(analysis.plannedPairs).toBe(2);
    expect(analysis.validPairs).toHaveLength(1);
    expect(analysis.missingPairs).toHaveLength(1);
    expect(analysis.missingPairs[0].pairId).toBe("fixture-r02");
  });

  it("validator definition change rejects resume", () => {
    const stored = { ...result("control"), caseDefinitionFingerprint: "a".repeat(64) };
    const current = { ...result("control"), caseDefinitionFingerprint: "b".repeat(64) };
    expect(resumeCompatibility(stored, current).resumeCompatible).toBe(false);
    expect(resumeCompatibility(stored, current).fields[0].field).toBe("caseDefinitionFingerprint");
  });

  it("manifest model drift rejects resume", async () => {
    const prior = { model: "model-a", modelConfig: { model: "model-a" }, timeoutMs: 1000, seed: 1, pairs: [], benchmarkHarnessFingerprint: "a".repeat(64), productionArtifactFingerprint: "b".repeat(64), athenaFrozenCommit: FROZEN_ATHENA_COMMIT };
    const current = { model: "model-b", modelConfig: { model: "model-b" }, timeoutMs: 1000, seed: 1, pairs: [], benchmarkHarnessFingerprint: "a".repeat(64), productionArtifactFingerprint: "b".repeat(64), athenaFrozenCommit: FROZEN_ATHENA_COMMIT };
    // @ts-expect-error JavaScript benchmark runner has no declaration output.
    const { manifestCompatibility } = await import("../runners/index.mjs");
    const compat = manifestCompatibility(prior, current);
    expect(compat.compatible).toBe(false);
    expect(compat.conflicts.some((c: { field: string }) => c.field === "model")).toBe(true);
  });

  it("ATHENA event workdir is context-redacted", () => {
    const ctx = { workdirRoot: "/tmp/not-athena-pattern/session-947" };
    const event = { type: "ACTION_PROPOSED", metadata: { tool: "bash", args: { command: "test", workdir: "/tmp/not-athena-pattern/session-947/work" } } };
    const redacted = redact(JSON.stringify(event), ctx);
    expect(redacted).not.toContain("/tmp/not-athena-pattern/session-947");
    expect(redacted).toContain("$WORKDIR");
  });

  it("validator output workdir is context-redacted", () => {
    const ctx = { workdirRoot: "/tmp/not-athena-pattern/session-947" };
    const validator = { success: true, evidence: [{ type: "command", output: "/tmp/not-athena-pattern/session-947/output.txt" }] };
    const redacted = redact(JSON.stringify(validator), ctx);
    expect(redacted).not.toContain("/tmp/not-athena-pattern/session-947");
    expect(redacted).toContain("$WORKDIR");
  });

  it("observed provider zero failures is 0 not null", () => {
    const runs = [
      { ...result("control", "fixture-r01"), athenaTelemetrySummary: { active: false, replan: 0, reflexCompleted: 0, jevCalls: null, jevFailures: null } },
      { ...result("treatment", "fixture-r01"), athenaTelemetrySummary: { active: true, replan: 0, reflexCompleted: 0, jevCalls: 4, jevFailures: 0 } },
    ];
    const analysis = analyzeRuns(runs);
    expect(analysis.treatment.jevCalls).toBe(4);
  });

  it("unknown provider remains null", () => {
    const runs = [
      { ...result("control", "fixture-r01"), athenaTelemetrySummary: { active: false, replan: 0, reflexCompleted: 0, jevCalls: null, jevFailures: null } },
      { ...result("treatment", "fixture-r01"), athenaTelemetrySummary: { active: true, replan: 0, reflexCompleted: 0, jevCalls: null, jevFailures: null } },
    ];
    const analysis = analyzeRuns(runs);
    expect(analysis.treatment.jevCalls).toBeNull();
  });

  it("validator ignoring SIGTERM receives SIGKILL", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "bench-validator-test-"));
    const scriptPath = join(tmpDir, "ignore-sigterm.mjs");
    await writeFile(scriptPath, `process.on("SIGTERM", () => {}); setInterval(() => {}, 100);`);
    // @ts-expect-error JavaScript benchmark validator has no declaration output.
    const { validateRun } = await import("../validators/index.mjs");
    const start = Date.now();
    const valResult = await validateRun({ fixtureRoot: tmpDir, runRoot: tmpDir, validator: { kind: "command", command: ["node", scriptPath], expectedExit: 0 }, baselineFiles: new Map(), timeoutMs: 1000 });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(8000);
    expect(valResult.evidence[0].signal).toBe("SIGKILL");
  });

  it("invalid CLI numeric values rejected", async () => {
    const runCli = async (args: string[]) => {
      try {
        await exec("node", ["bench/runners/cli.mjs", "pair", "--case", "straightforward-fix", ...args], { cwd: process.cwd() });
        return { success: true };
      } catch (error: unknown) {
        return { success: false, message: (error as Error).message };
      }
    };
    expect((await runCli(["--replicates", "0"])).success).toBe(false);
    expect((await runCli(["--replicates", "-1"])).success).toBe(false);
    expect((await runCli(["--replicates", "abc"])).success).toBe(false);
    expect((await runCli(["--timeout", "abc"])).success).toBe(false);
    expect((await runCli(["--timeout", "0"])).success).toBe(false);
    expect((await runCli(["--seed", "abc"])).success).toBe(false);
  });

  it("--confirm-live false cannot launch live execution", async () => {
    try {
      await exec("node", ["bench/runners/cli.mjs", "pair", "--case", "straightforward-fix", "--confirm-live", "false"], { cwd: process.cwd() });
      throw new Error("should have failed");
    } catch (error: unknown) {
      expect((error as Error).message).toContain("Live benchmark requires --confirm-live");
    }
  });

  it("programmatic runPair cannot bypass live confirmation", async () => {
    // @ts-expect-error JavaScript benchmark runner has no declaration output.
    const { runPair } = await import("../runners/index.mjs");
    const plan = planExperiment({ caseDefinition: sampleCase, replicates: 1, seed: 1, model: "m", timeoutMs: 1000, experimentId: "test-gate" });
    await expect(
      runPair({ caseId: "fixture", replicate: 1, seed: 1, timeoutMs: 1000, model: "m", dryRun: false, experimentPlan: plan, confirmLive: false }),
    ).rejects.toThrow("confirmLive");
  });

  it("dry-run never invokes the opencode executable (sentinel test)", async () => {
    const sentinelDir = await mkdtemp(join(tmpdir(), "bench-sentinel-"));
    const sentinelPath = join(sentinelDir, "opencode-sentinel");
    const binDir = join(sentinelDir, "bin");
    await mkdir(binDir, { recursive: true });
    const fakeOpenCode = join(binDir, "opencode");
    await writeFile(fakeOpenCode, `#!/bin/sh\ntouch "${sentinelPath}"\nexit 0\n`);
    await chmod(fakeOpenCode, 0o755);
    const originalPath = process.env.PATH;
    try {
      process.env.PATH = `${binDir}:${originalPath}`;
      // @ts-expect-error JavaScript benchmark runner has no declaration output.
      const { runPair } = await import("../runners/index.mjs");
      // @ts-expect-error JavaScript benchmark runner has no declaration output.
      const { loadCase } = await import("../runners/index.mjs");
      const caseDefinition = await loadCase("controlled-semantic-loop");
      const plan = planExperiment({ caseDefinition, replicates: 1, seed: 1, model: "m", timeoutMs: 1000, experimentId: "test-sentinel" });
      const pairResult = await runPair({ caseId: "controlled-semantic-loop", replicate: 1, seed: 1, timeoutMs: 1000, model: "m", dryRun: true, experimentPlan: plan, confirmLive: false });
      let sentinelExists = false;
      try { await access(sentinelPath); sentinelExists = true; } catch { sentinelExists = false; }
      expect(sentinelExists).toBe(false);
      expect(pairResult.pairId).toBe("controlled-semantic-loop-r01");
      expect(pairResult.runs).toHaveLength(2);
      expect(pairResult.runs.every((r: { validator: { evidence: Array<{ type: string }> } }) => r.validator.evidence.some((e: { type: string }) => e.type === "dry-run"))).toBe(true);
    } finally {
      process.env.PATH = originalPath;
    }
  });
});
