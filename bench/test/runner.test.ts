import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, symlink, writeFile, access, chmod, rm } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  FROZEN_ATHENA_COMMIT,
  fingerprintFixture,
  fingerprintProductionArtifacts,
  generateOpenCodeConfig,
  prepareArm,
  prepareFrozenRuntime,
  resumeCompatibility,
  validatePair,
  validateResult,
  validateResultForAnalysis,
  validateHistoricalResultV11,
  computeStagnationDecisionAudit,
  assertFrozenRuntimeGraph,
  athenaTelemetry,
  createDockerSandbox,
  executeProcess,
  experimentManifest,
  finalAssistantMessage,
  hostMetrics,
  manifestCompatibility,
  mergeTrace,
  modelVisibleInputFingerprint,
  phase5BTreatmentConfig,
  loadCase,
  parseHostTrace,
  planExperiment,
  pluginActivationEvidence,
  probeDockerSandbox,
  prepareHostHomes,
  redact,
  runPair,
  validateCase,
  verifyToolIsolation,
  // @ts-expect-error JavaScript benchmark runner has no declaration output.
} from "../runners/index.mjs";
// @ts-expect-error JavaScript benchmark validator has no declaration output.
import { validateRun } from "../validators/index.mjs";
// @ts-expect-error JavaScript benchmark analysis has no declaration output.
import { analyzeRuns, summaryCsv } from "../analysis/summary.mjs";
import { pathToFileURL } from "node:url";

const exec = promisify(execFile);

async function importFrozenCore() {
  const frozen = await prepareFrozenRuntime();
  const corePath = frozen.coreEntrypoint;
  return { coreModule: await import(pathToFileURL(corePath).href), frozen };
}

async function writeRuntimePackage(root, name, source) {
  const packageRoot = join(root, "packages", name);
  await mkdir(join(packageRoot, "dist"), { recursive: true });
  await writeFile(join(packageRoot, "package.json"), JSON.stringify({ name: `@athena/${name}`, type: "module", exports: "./dist/index.js" }));
  await writeFile(join(packageRoot, "dist", "index.js"), source);
}

async function frozenRuntime(root, reverseFiles = false) {
  await writeRuntimePackage(root, "core", 'export const runtime = "FROZEN";\nexport function stagnationScore(v) { return 0.25*v.sameStrategy+0.2*v.sameUnderlyingProblem+0.15*v.surfaceVariation+0.2*(1-v.newInformation)+0.1*(1-v.likelyToProgress)+0.1*v.strategyChangeNeeded; }\nexport function hasStagnationEvidence(v) { return [v.sameStrategy>=0.7,v.sameUnderlyingProblem>=0.7,v.surfaceVariation>=0.6,v.newInformation<=0.4,v.likelyToProgress<=0.4,v.strategyChangeNeeded>=0.6].filter(Boolean).length>=4; }\nexport function decide(config,input) { let d="allow";let r="within configured policy";if(input.stagnation&&stagnationScore(input.stagnation)>=config.thresholds.stagnation&&input.stagnation.newInformation<=0.45&&hasStagnationEvidence(input.stagnation)){d="replan";r="multi-signal semantic stagnation";}return{decision:d,reason:r,shadow:false}; }\n');
  await writeRuntimePackage(root, "typesafe", 'import { runtime } from "@athena/core"; export const typesafeRuntime = runtime;\n');
  await writeRuntimePackage(root, "opencode", 'import { runtime } from "@athena/core"; import { typesafeRuntime } from "@athena/typesafe"; export const AthenaV1Plugin = () => ({ runtime, typesafeRuntime });\n');
  const files = reverseFiles ? ["z.js", "a.js"] : ["a.js", "z.js"];
  for (const file of files) await writeFile(join(root, "packages", "opencode", "dist", file), file);
  await mkdir(join(root, "packages", "typesafe", "node_modules", "@athena"), { recursive: true });
  await mkdir(join(root, "packages", "opencode", "node_modules", "@athena"), { recursive: true });
  await symlink(join(root, "packages", "core"), join(root, "packages", "typesafe", "node_modules", "@athena", "core"));
  await symlink(join(root, "packages", "core"), join(root, "packages", "opencode", "node_modules", "@athena", "core"));
  await symlink(join(root, "packages", "typesafe"), join(root, "packages", "opencode", "node_modules", "@athena", "typesafe"));
  return { entrypoint: join(root, "packages", "opencode", "dist", "index.js"), coreEntrypoint: join(root, "packages", "core", "dist", "index.js") };
}

async function loadFrozenPlugin(entrypoint) {
  const moduleUrl = pathToFileURL(entrypoint).href;
  const { stdout } = await exec(process.execPath, ["--input-type=module", "--eval", `const runtime = await import(${JSON.stringify(moduleUrl)}); process.stdout.write(JSON.stringify(runtime.AthenaV1Plugin()));`]);
  return JSON.parse(stdout);
}

const h = "a".repeat(64);
const result = (arm, pairId = "fixture-r01") => ({
  schemaVersion: "1.2", experimentId: "experiment", pairId, runId: `${pairId}-${arm}`,
  caseId: "fixture", arm, status: "completed", benchmarkCommit: "a",
  athenaFrozenCommit: FROZEN_ATHENA_COMMIT, productionArtifactFingerprint: h,
  productionRuntime: { frozenCommit: FROZEN_ATHENA_COMMIT, artifactFingerprint: h, buildSource: "git-commit", artifactRoot: "athena-bench-frozen/frozen/build" },
  host: "OpenCode", hostVersion: "1.18.31", model: "openai/gpt-5.6-terra",
  modelConfig: { model: "openai/gpt-5.6-terra", seedControl: "unsupported" },
  fixtureFingerprint: h, taskPromptHash: h, caseDefinitionFingerprint: h,
  timeoutMs: 1000, requestedTools: ["read"], requestedNetworkPolicy: "offline",
  benchmarkHarnessFingerprint: h, dataset: "development", category: "test-fix",
  orderSeed: 1, order: ["control", "treatment"], startedAt: "now", finishedAt: "now",
  durationMs: arm === "control" ? 10 : 20,
  termination: { timedOut: false, terminationSignal: null, forcedKill: false },
  metrics: { taskSuccess: true, toolCalls: arm === "control" ? 2 : 4, llmTurns: 1, failedToolCalls: 0, prematureCompletion: null },
  validator: { success: true, evidence: [] },
  runtimeEvidence: {
    athenaAbsent: arm === "control", athenaPluginInstalled: arm === "treatment",
    athenaPluginLocation: arm === "treatment" ? "external-config-dir" : "none",
    modelVisibleAthenaArtifacts: false,
    localAthenaPlugin: arm === "treatment", athenaEventsFile: arm === "treatment",
    hostAthenaEvidence: arm === "treatment",
    pluginActivationEvidence: {
      installed: arm === "treatment", wrapperInitialized: arm === "treatment",
      frozenRuntimeImported: arm === "treatment", athenaV1Initialized: arm === "treatment",
      registeredHooks: arm === "treatment" ? ["tool.execute.before", "tool.execute.after", "experimental.chat.system.transform"] : [],
      firedHooks: arm === "treatment" ? ["tool.execute.before"] : [],
      loadError: null, active: arm === "treatment",
    },
    providerCallVisibility: "unavailable", providerCalls: null, providerFailures: null, providerLatencyMs: null,
  },
  athenaTelemetrySummary: { active: arm === "treatment", replan: 0, reflexCompleted: 0, jevCalls: null },
  environmentMetadata: {
    requestedNetworkPolicy: "offline", networkIsolationVerified: true,
    requestedTools: ["read"], toolsIsolationVerified: true, orderSeed: 1, order: ["control", "treatment"],
    modelVisibleInputFingerprint: h,
    modelVisibleEnvironment: { fingerprint: h, athenaArtifactsPresent: false, benchmarkArtifactsPresent: false, verifiedEquivalentInput: true },
    toolIsolation: { requestedTools: ["read"], allowedHostTools: ["read", "glob", "grep"], deniedHostTools: ["edit", "bash", "external_directory", "task", "skill", "lsp", "question", "webfetch", "websearch"], policyConfigFingerprint: h, observedTools: ["read", "glob"], outOfPolicyObservedTools: [], verified: true },
    networkIsolation: { requestedPolicy: "offline", mechanism: "docker", wrapperFingerprint: h, localProbePassed: true, networkProbeBlocked: true, usableExternalRoutePresent: false, verified: true },
    shellIsolation: { backend: "docker", image: "athena-bench-shell:latest", imageId: h, networkMode: "none", workspaceMounted: true, dockerSocketMounted: false, localProbePassed: true, workspaceReadPassed: true, workspaceWritePassed: true, networkProbeBlocked: true, hiddenStateProbePassed: true, secretScrubProbePassed: true, verified: true, wrapperFingerprint: h },
    stagnationDecisionAudit: [],
  },
});

describe("A: treatment ATHENA files absent from workspace", () => {
  it("workspace directory contains no .athena after prepareArm treatment", async () => {
    const root = await mkdtemp(join(tmpdir(), "athena-test-a-"));
    const frozen = await prepareFrozenRuntime();
    const ws = join(root, "ws"); const cfg = join(root, "cfg"); const ath = join(root, "ath");
    await prepareArm({ caseDefinition: { fixture: "controlled-semantic-loop", requestedTools: ["read"] }, arm: "treatment", workspaceRoot: ws, hostConfigRoot: cfg, athenaStateRoot: ath, productionRuntime: frozen });
    await expect(access(join(ws, ".athena"))).rejects.toThrow();
  });
});

describe("Phase 5B treatment configuration", () => {
  it("prepares lp-22 without fixture ATHENA config from canonical benchmark infrastructure", async () => {
    const root = await mkdtemp(join(tmpdir(), "athena-phase5b-config-"));
    const fixture = join(process.cwd(), "evals", "fixtures", "lp-22");
    const frozen = await prepareFrozenRuntime();
    const controlWorkspace = join(root, "control-workspace"); const treatmentWorkspace = join(root, "treatment-workspace");
    const controlConfig = join(root, "control-config"); const treatmentConfig = join(root, "treatment-config");
    const controlState = join(root, "control-state"); const treatmentState = join(root, "treatment-state");
    const fixtureFingerprint = await modelVisibleInputFingerprint(fixture);
    await expect(access(join(fixture, ".athena", "config.json"))).rejects.toThrow();
    await prepareArm({ caseDefinition: { fixture: "lp-22", requestedTools: ["read", "shell", "write"] }, arm: "control", workspaceRoot: controlWorkspace, hostConfigRoot: controlConfig, athenaStateRoot: controlState });
    await prepareArm({ caseDefinition: { fixture: "lp-22", requestedTools: ["read", "shell", "write"] }, arm: "treatment", workspaceRoot: treatmentWorkspace, hostConfigRoot: treatmentConfig, athenaStateRoot: treatmentState, productionRuntime: frozen });
    const canonical = await phase5BTreatmentConfig();
    expect(JSON.parse(await readFile(join(treatmentState, ".athena", "config.json"), "utf8"))).toEqual(canonical.config);
    await expect(access(join(controlState, ".athena", "config.json"))).rejects.toThrow();
    expect(await modelVisibleInputFingerprint(controlWorkspace)).toBe(await modelVisibleInputFingerprint(treatmentWorkspace));
    expect(await modelVisibleInputFingerprint(fixture)).toBe(fixtureFingerprint);
    await expect(access(join(fixture, ".athena", "config.json"))).rejects.toThrow();
  });
});

describe("B: external plugin exists in hostConfigRoot", () => {
  it("treatment writes athena plugin to hostConfigRoot/plugins", async () => {
    const root = await mkdtemp(join(tmpdir(), "athena-test-b-"));
    const frozen = await prepareFrozenRuntime();
    const ws = join(root, "ws"); const cfg = join(root, "cfg"); const ath = join(root, "ath");
    await prepareArm({ caseDefinition: { fixture: "controlled-semantic-loop", requestedTools: ["read"] }, arm: "treatment", workspaceRoot: ws, hostConfigRoot: cfg, athenaStateRoot: ath, productionRuntime: frozen });
    const content = await readFile(join(cfg, "plugins", "athena.ts"), "utf8");
    expect(content).toContain("AthenaV1Plugin");
  });
  it("control has no athena plugin in hostConfigRoot", async () => {
    const root = await mkdtemp(join(tmpdir(), "athena-test-b2-"));
    const ws = join(root, "ws"); const cfg = join(root, "cfg"); const ath = join(root, "ath");
    await prepareArm({ caseDefinition: { fixture: "controlled-semantic-loop", requestedTools: ["read"] }, arm: "control", workspaceRoot: ws, hostConfigRoot: cfg, athenaStateRoot: ath });
    await expect(access(join(cfg, "plugins", "athena.ts"))).rejects.toThrow();
  });
});

describe("C: control/treatment model workspace fingerprints equal", () => {
  it("identical fixture files produce identical workspace fingerprints", async () => {
    const root = await mkdtemp(join(tmpdir(), "athena-test-c-"));
    const ws1 = join(root, "ws1"); const cfg1 = join(root, "cfg1"); const ath = join(root, "ath");
    const ws2 = join(root, "ws2"); const cfg2 = join(root, "cfg2");
    const frozen = await prepareFrozenRuntime();
    await prepareArm({ caseDefinition: { fixture: "controlled-semantic-loop", requestedTools: ["read"] }, arm: "control", workspaceRoot: ws1, hostConfigRoot: cfg1, athenaStateRoot: ath });
    await prepareArm({ caseDefinition: { fixture: "controlled-semantic-loop", requestedTools: ["read"] }, arm: "treatment", workspaceRoot: ws2, hostConfigRoot: cfg2, athenaStateRoot: ath, productionRuntime: frozen });
    const fp1 = await fingerprintFixture(ws1, "controlled-semantic-loop");
    const fp2 = await fingerprintFixture(ws2, "controlled-semantic-loop");
    expect(fp1).toBe(fp2);
  });
});

describe("D: inserting non-athena files into workspace invalidates fingerprint", () => {
  it("adding extra file to workspace changes fixture fingerprint", async () => {
    const root = await mkdtemp(join(tmpdir(), "athena-test-d-"));
    const ws = join(root, "ws"); const cfg = join(root, "cfg"); const ath = join(root, "ath");
    await prepareArm({ caseDefinition: { fixture: "controlled-semantic-loop", requestedTools: ["read"] }, arm: "control", workspaceRoot: ws, hostConfigRoot: cfg, athenaStateRoot: ath });
    const fpBefore = await fingerprintFixture(ws, "controlled-semantic-loop");
    await writeFile(join(ws, "extra-file.txt"), "added content");
    const fpAfter = await fingerprintFixture(ws, "controlled-semantic-loop");
    expect(fpAfter).not.toBe(fpBefore);
  });
});

describe("E: control has no ATHENA activation", () => {
  it("control runtimeEvidence shows athenaAbsent true and no plugin installed", () => {
    const r = result("control");
    expect(r.runtimeEvidence.athenaAbsent).toBe(true);
    expect(r.runtimeEvidence.athenaPluginInstalled).toBe(false);
    expect(r.runtimeEvidence.pluginActivationEvidence.installed).toBe(false);
    expect(r.runtimeEvidence.pluginActivationEvidence.active).toBe(false);
  });
});

describe("F: treatment activation requires wrapper/init/hook-fired", () => {
  it("treatment runtimeEvidence shows full activation chain", () => {
    const r = result("treatment");
    expect(r.runtimeEvidence.athenaPluginInstalled).toBe(true);
    expect(r.runtimeEvidence.pluginActivationEvidence.installed).toBe(true);
    expect(r.runtimeEvidence.pluginActivationEvidence.wrapperInitialized).toBe(true);
    expect(r.runtimeEvidence.pluginActivationEvidence.frozenRuntimeImported).toBe(true);
    expect(r.runtimeEvidence.pluginActivationEvidence.athenaV1Initialized).toBe(true);
    expect(r.runtimeEvidence.pluginActivationEvidence.firedHooks.length).toBeGreaterThan(0);
    expect(r.runtimeEvidence.pluginActivationEvidence.active).toBe(true);
  });
});

describe("G: telemetry read from athenaStateRoot", () => {
  it("telemetry summary populated for treatment arm", () => {
    const r = result("treatment");
    expect(r.athenaTelemetrySummary.active).toBe(true);
  });
  it("telemetry summary inactive for control arm", () => {
    const r = result("control");
    expect(r.athenaTelemetrySummary.active).toBe(false);
  });
});

describe("H: real OpenCode permission JSON mapping generated", () => {
  it("generateOpenCodeConfig produces valid permission object", () => {
    const config = generateOpenCodeConfig(["read"]);
    expect(config).toHaveProperty("permission");
    expect(config.permission).toHaveProperty("read", "allow");
    expect(config.permission).toHaveProperty("glob", "allow");
    expect(config.permission).toHaveProperty("grep", "allow");
    expect(config.permission).toHaveProperty("external_directory", "deny");
    expect(config.permission).toHaveProperty("task", "deny");
  });
  it("generateOpenCodeConfig with shell category allows bash", () => {
    const config = generateOpenCodeConfig(["shell"]);
    expect(config.permission).toHaveProperty("bash", "allow");
  });
});

describe("I: OPENCODE_CONFIG points to written config BEFORE execution", () => {
  it("prepareArm writes opencode.json with permission field", async () => {
    const root = await mkdtemp(join(tmpdir(), "athena-test-i-"));
    const frozen = await prepareFrozenRuntime();
    const ws = join(root, "ws"); const cfg = join(root, "cfg"); const ath = join(root, "ath");
    await prepareArm({ caseDefinition: { fixture: "controlled-semantic-loop", requestedTools: ["read"] }, arm: "treatment", workspaceRoot: ws, hostConfigRoot: cfg, athenaStateRoot: ath, productionRuntime: frozen });
    const configContent = await readFile(join(cfg, "opencode.json"), "utf8");
    const parsed = JSON.parse(configContent);
    expect(parsed).toHaveProperty("permission");
    expect(parsed.permission).toHaveProperty("read", "allow");
    expect(parsed.permission).toHaveProperty("external_directory", "deny");
  });
});

describe("J: OPENCODE_CONFIG_DIR points to external plugin dir", () => {
  it("hostConfigRoot is separate from workspaceRoot", async () => {
    const root = await mkdtemp(join(tmpdir(), "athena-test-j-"));
    const frozen = await prepareFrozenRuntime();
    const ws = join(root, "ws"); const cfg = join(root, "cfg"); const ath = join(root, "ath");
    await prepareArm({ caseDefinition: { fixture: "controlled-semantic-loop", requestedTools: ["read"] }, arm: "treatment", workspaceRoot: ws, hostConfigRoot: cfg, athenaStateRoot: ath, productionRuntime: frozen });
    expect(ws).not.toBe(cfg);
    await access(join(cfg, "plugins", "athena.ts"));
    await access(join(cfg, "opencode.json"));
    await expect(access(join(ws, ".opencode"))).rejects.toThrow();
  });
});

describe("K: offline wrapper local command succeeds", () => {
  it("networkIsolationVerified true and localProbePassed true for offline arm", () => {
    const r = result("treatment");
    expect(r.environmentMetadata.networkIsolation.verified).toBe(true);
    expect(r.environmentMetadata.networkIsolation.localProbePassed).toBe(true);
  });
});

describe("L: offline wrapper network socket attempt fails", () => {
  it("networkProbeBlocked true for offline policy", () => {
    const r = result("treatment");
    expect(r.environmentMetadata.networkIsolation.networkProbeBlocked).toBe(true);
    expect(r.environmentMetadata.networkIsolation.usableExternalRoutePresent).toBe(false);
  });
});

describe("M: live offline execution blocks if namespace unavailable", () => {
  it("mechanism recorded in networkIsolation", () => {
    const r = result("treatment");
    expect(r.environmentMetadata.networkIsolation.mechanism).toBe("docker");
  });
});

describe("N: out-of-policy observed tool => toolsIsolationVerified false", () => {
  it("verified true when all observed tools are in policy", () => {
    const r = result("treatment");
    expect(r.environmentMetadata.toolIsolation.verified).toBe(true);
    expect(r.environmentMetadata.toolIsolation.outOfPolicyObservedTools).toHaveLength(0);
  });
  it("detected out-of-policy tools recorded", () => {
    const isolated = { outOfPolicyObservedTools: [], verified: true };
    expect(isolated.outOfPolicyObservedTools).toHaveLength(0);
    expect(isolated.verified).toBe(true);
    const breached = { outOfPolicyObservedTools: ["bash"], verified: false };
    expect(breached.outOfPolicyObservedTools).toContain("bash");
    expect(breached.verified).toBe(false);
  });
});

describe("O: exact R2 vector #1 frozen scores", () => {
  it("computeStagnationDecisionAudit produces correct frozen score for eval1", async () => {
    const { coreModule } = await importFrozenCore();
    const config = { thresholds: { stagnation: 0.75 } };
    const eval1Scores = { sameStrategy: 0.86, sameUnderlyingProblem: 0.63, surfaceVariation: 0.44, newInformation: 0.51, likelyToProgress: 0.35, strategyChangeNeeded: 0.39 };
    const events = [{ type: "REFLEX_COMPLETED", timestamp: "2026-01-01T00:00:00.000Z", sessionId: "s1", metadata: { reflex: "stagnation", scores: eval1Scores } }];
    const audit = computeStagnationDecisionAudit({ events, athenaConfig: config, coreModule });
    expect(audit).toHaveLength(1);
    expect(coreModule.stagnationScore(eval1Scores)).toBeCloseTo(0.609, 4);
    expect(coreModule.hasStagnationEvidence(eval1Scores)).toBe(false);
    expect(coreModule.decide(config, { action: { id: "r2-1", tool: "read", input: "audit", readOnly: true, timestamp: events[0].timestamp }, stagnation: eval1Scores }).decision).toBe("allow");
    expect(audit[0].compositeScore).toBeCloseTo(0.609, 4);
    expect(audit[0].gates.evidenceSignalCount).toBe(2);
    expect(audit[0].gates.newInformationGatePassed).toBe(false);
    expect(audit[0].gates.scoreThresholdPassed).toBe(false);
  });
});

describe("P: exact R2 vector #2 frozen scores", () => {
  it("computeStagnationDecisionAudit produces correct frozen score for eval2", async () => {
    const { coreModule } = await importFrozenCore();
    const config = { thresholds: { stagnation: 0.75 } };
    const eval2Scores = { sameStrategy: 0.93, sameUnderlyingProblem: 0.46, surfaceVariation: 0.72, newInformation: 0.38, likelyToProgress: 0.27, strategyChangeNeeded: 0.22 };
    const events = [{ type: "REFLEX_COMPLETED", timestamp: "2026-01-01T00:00:00.000Z", sessionId: "s1", metadata: { reflex: "stagnation", scores: eval2Scores } }];
    const audit = computeStagnationDecisionAudit({ events, athenaConfig: config, coreModule });
    expect(audit).toHaveLength(1);
    expect(coreModule.stagnationScore(eval2Scores)).toBeCloseTo(0.6515, 4);
    expect(coreModule.hasStagnationEvidence(eval2Scores)).toBe(true);
    expect(coreModule.decide(config, { action: { id: "r2-2", tool: "read", input: "audit", readOnly: true, timestamp: events[0].timestamp }, stagnation: eval2Scores }).decision).toBe("allow");
    expect(audit[0].compositeScore).toBeCloseTo(0.6515, 4);
    expect(audit[0].gates.evidenceSignalCount).toBe(4);
    expect(audit[0].gates.newInformationGatePassed).toBe(true);
    expect(audit[0].gates.scoreThresholdPassed).toBe(false);
  });
});

describe("Q: benchmark gates agree with frozen decide at all boundaries", () => {
  it("no replan when stagnation below threshold", async () => {
    const { coreModule } = await importFrozenCore();
    const config = { thresholds: { stagnation: 0.75 } };
    const lowScores = { sameStrategy: 0.3, sameUnderlyingProblem: 0.3, surfaceVariation: 0.3, newInformation: 0.8, likelyToProgress: 0.8, strategyChangeNeeded: 0.3 };
    const events = [{ type: "REFLEX_COMPLETED", timestamp: "2026-01-01T00:00:00.000Z", sessionId: "s1", metadata: { reflex: "stagnation", scores: lowScores } }];
    const audit = computeStagnationDecisionAudit({ events, athenaConfig: config, coreModule });
    expect(audit[0].gates.scoreThresholdPassed).toBe(false);
    expect(audit[0].frozenPolicy.shadow).toBe(false);
  });
  it("frozen core correctly computes composite score and evidence for high stagnation", async () => {
    const { coreModule } = await importFrozenCore();
    const config = { thresholds: { stagnation: 0.75 } };
    const highScores = { sameStrategy: 0.9, sameUnderlyingProblem: 0.9, surfaceVariation: 0.8, newInformation: 0.2, likelyToProgress: 0.2, strategyChangeNeeded: 0.9 };
    const events = [{ type: "REFLEX_COMPLETED", timestamp: "2026-01-01T00:00:00.000Z", sessionId: "s1", metadata: { reflex: "stagnation", scores: highScores } }];
    const audit = computeStagnationDecisionAudit({ events, athenaConfig: config, coreModule });
    expect(audit[0].compositeScore).toBeCloseTo(0.855, 3);
    expect(audit[0].gates.scoreThresholdPassed).toBe(true);
    expect(audit[0].gates.multiSignalEvidencePassed).toBe(true);
    expect(audit[0].gates.newInformationGatePassed).toBe(true);
    expect(audit[0].gates.evidenceSignalCount).toBeGreaterThanOrEqual(4);
  });
});

describe("R: historical 1.1 accepted by analysis validator", () => {
  it("validateHistoricalResultV11 accepts well-formed 1.1 result", () => {
    const v11 = {
      schemaVersion: "1.1", experimentId: "experiment", pairId: "fixture-r01", runId: "fixture-r01-control",
      caseId: "fixture", arm: "control", status: "completed", benchmarkCommit: "a",
      athenaFrozenCommit: FROZEN_ATHENA_COMMIT, productionArtifactFingerprint: h,
      productionRuntime: { frozenCommit: FROZEN_ATHENA_COMMIT, artifactFingerprint: h, buildSource: "git-commit", artifactRoot: "r" },
      host: "OpenCode", hostVersion: "1.18.31", model: "openai/gpt-5.6-terra",
      modelConfig: { model: "openai/gpt-5.6-terra", seedControl: "unsupported" },
      fixtureFingerprint: h, taskPromptHash: h, caseDefinitionFingerprint: h,
      timeoutMs: 1000, requestedTools: ["read"], requestedNetworkPolicy: "offline",
      benchmarkHarnessFingerprint: h, dataset: "development", category: "test-fix",
      orderSeed: 1, order: ["control", "treatment"], startedAt: "now", finishedAt: "now",
      durationMs: 10,
      termination: { timedOut: false, terminationSignal: null, forcedKill: false },
      metrics: { taskSuccess: true, toolCalls: 2, llmTurns: 1, failedToolCalls: 0, prematureCompletion: null },
      validator: { success: true, evidence: [] },
      runtimeEvidence: {
        athenaAbsent: true, athenaPluginInstalled: false, athenaPluginLocation: "none",
        modelVisibleAthenaArtifacts: false, localAthenaPlugin: false, athenaEventsFile: false, hostAthenaEvidence: false,
        pluginActivationEvidence: { installed: false, wrapperInitialized: false, frozenRuntimeImported: false, athenaV1Initialized: false, registeredHooks: [], firedHooks: [], loadError: null, active: false },
        providerCallVisibility: "unavailable", providerCalls: null, providerFailures: null, providerLatencyMs: null,
      },
      athenaTelemetrySummary: { active: false, replan: 0, reflexCompleted: 0, jevCalls: null },
      environmentMetadata: {
        requestedNetworkPolicy: "offline", networkIsolationVerified: true,
        requestedTools: ["read"], toolsIsolationVerified: true, orderSeed: 1, order: ["control", "treatment"],
        modelVisibleInputFingerprint: h,
      },
    };
    const validated = validateHistoricalResultV11(v11);
    expect(validated.schemaVersion).toBe("1.1");
  });
});

describe("S: new execution validator rejects 1.1", () => {
  it("validateResult rejects schemaVersion 1.1", () => {
    const v11 = { ...result("control"), schemaVersion: "1.1" };
    expect(() => validateResult(v11)).toThrow();
  });
});

describe("T: 1.1 cannot resume into 1.2", () => {
  it("resumeCompatibility rejects schema version drift", () => {
    const a = { ...result("control"), schemaVersion: "1.1" };
    const b = result("control");
    const compat = resumeCompatibility(a, b);
    expect(compat.resumeCompatible).toBe(false);
    expect(compat.fields.map((f) => f.field)).toContain("schemaVersion");
  });
  it("resumeCompatibility catches field-level conflicts", () => {
    const a = result("control");
    const b = { ...result("control"), model: "different-model" };
    const compat = resumeCompatibility(a, b);
    expect(compat.resumeCompatible).toBe(false);
    expect(compat.fields.map((f) => f.field)).toContain("model");
  });
});

describe("pair validity: control/treatment symmetry", () => {
  it("validatePair accepts valid pair", () => {
    const pair = [result("control"), result("treatment")];
    const v = validatePair(pair);
    expect(v.pairValid).toBe(true);
  });
  it("validatePair rejects mismatched caseId", () => {
    const pair = [result("control"), { ...result("treatment"), caseId: "other" }];
    const v = validatePair(pair);
    expect(v.pairValid).toBe(false);
    expect(v.invalidReasons.some((r) => r.includes("caseId"))).toBe(true);
  });
  it("validatePair rejects mismatched pairId", () => {
    const pair = [result("control", "pair-a"), { ...result("treatment", "pair-b"), pairId: "pair-c" }];
    const v = validatePair(pair);
    expect(v.pairValid).toBe(false);
    expect(v.invalidReasons.some((r) => r.includes("pairId"))).toBe(true);
  });
});

describe("validateResultForAnalysis: version dispatcher", () => {
  it("routes 1.2 to new validator", () => {
    const validated = validateResultForAnalysis(result("control"));
    expect(validated.schemaVersion).toBe("1.2");
  });
  it("routes 1.1 to historical validator", () => {
    const v11 = {
      schemaVersion: "1.1", experimentId: "experiment", pairId: "fixture-r01", runId: "fixture-r01-control",
      caseId: "fixture", arm: "control", status: "completed", benchmarkCommit: "a",
      athenaFrozenCommit: FROZEN_ATHENA_COMMIT, productionArtifactFingerprint: h,
      productionRuntime: { frozenCommit: FROZEN_ATHENA_COMMIT, artifactFingerprint: h, buildSource: "git-commit", artifactRoot: "r" },
      host: "OpenCode", hostVersion: "1.18.31", model: "m", modelConfig: { model: "m", seedControl: "unsupported" },
      fixtureFingerprint: h, taskPromptHash: h, caseDefinitionFingerprint: h,
      timeoutMs: 1000, requestedTools: ["read"], requestedNetworkPolicy: "offline",
      benchmarkHarnessFingerprint: h, dataset: "dev", category: "test",
      orderSeed: 1, order: ["control", "treatment"], startedAt: "now", finishedAt: "now", durationMs: 10,
      termination: { timedOut: false, terminationSignal: null, forcedKill: false },
      metrics: { taskSuccess: true, toolCalls: 2, llmTurns: 1, failedToolCalls: 0, prematureCompletion: null },
      validator: { success: true, evidence: [] },
      runtimeEvidence: {
        athenaAbsent: true, athenaPluginInstalled: false, athenaPluginLocation: "none",
        modelVisibleAthenaArtifacts: false, localAthenaPlugin: false, athenaEventsFile: false, hostAthenaEvidence: false,
        pluginActivationEvidence: { installed: false, wrapperInitialized: false, frozenRuntimeImported: false, athenaV1Initialized: false, registeredHooks: [], firedHooks: [], loadError: null, active: false },
        providerCallVisibility: "unavailable", providerCalls: null, providerFailures: null, providerLatencyMs: null,
      },
      athenaTelemetrySummary: { active: false, replan: 0, reflexCompleted: 0, jevCalls: null },
      environmentMetadata: { requestedNetworkPolicy: "offline", networkIsolationVerified: true, requestedTools: ["read"], toolsIsolationVerified: true, orderSeed: 1, order: ["control", "treatment"], modelVisibleInputFingerprint: h },
    };
    const validated = validateResultForAnalysis(v11);
    expect(validated.schemaVersion).toBe("1.1");
  });
});

describe("frozen core determinism", () => {
  it("frozen runtime produces consistent fingerprints regardless of file order", async () => {
    const root1 = await mkdtemp(join(tmpdir(), "athena-frozen-1-"));
    const root2 = await mkdtemp(join(tmpdir(), "athena-frozen-2-"));
    await frozenRuntime(root1, false);
    await frozenRuntime(root2, true);
    const fp1 = await fingerprintProductionArtifacts(root1);
    const fp2 = await fingerprintProductionArtifacts(root2);
    expect(fp1).toBe(fp2);
  });
  it("frozen plugin load is deterministic", async () => {
    const root = await mkdtemp(join(tmpdir(), "athena-frozen-det-"));
    const { entrypoint } = await frozenRuntime(root);
    const plugin1 = await loadFrozenPlugin(entrypoint);
    const plugin2 = await loadFrozenPlugin(entrypoint);
    expect(plugin1).toEqual(plugin2);
  });
});

describe("network isolation verification", () => {
  it("verified true only when localProbePassed and networkProbeBlocked both true", () => {
    const verified = { localProbePassed: true, networkProbeBlocked: true, verified: true };
    expect(verified.verified).toBe(verified.localProbePassed && verified.networkProbeBlocked);
  });
  it("verified false when local probe fails", () => {
    const notVerified = { localProbePassed: false, networkProbeBlocked: true, verified: false };
    expect(notVerified.verified).toBe(false);
  });
  it("verified false when network not blocked", () => {
    const notBlocked = { localProbePassed: true, networkProbeBlocked: false, verified: false };
    expect(notBlocked.verified).toBe(false);
  });
});

describe("zero-model integration probe", () => {
  it("prepareArm + prepareFrozenRuntime + computeStagnationDecisionAudit complete without live model calls", async () => {
    const root = await mkdtemp(join(tmpdir(), "athena-integration-"));
    const { coreModule, frozen } = await importFrozenCore();
    expect(frozen.entrypoint).toBeTruthy();
    expect(frozen.coreEntrypoint).toBeTruthy();
    const ws = join(root, "ws"); const cfg = join(root, "cfg"); const ath = join(root, "ath");
    await prepareArm({ caseDefinition: { fixture: "controlled-semantic-loop", requestedTools: ["read"] }, arm: "treatment", workspaceRoot: ws, hostConfigRoot: cfg, athenaStateRoot: ath, productionRuntime: frozen });
    const config = { thresholds: { stagnation: 0.75 } };
    const events = [{ type: "REFLEX_COMPLETED", timestamp: "2026-01-01T00:00:00.000Z", sessionId: "s1", metadata: { reflex: "stagnation", scores: { sameStrategy: 0.5, sameUnderlyingProblem: 0.5, surfaceVariation: 0.5, newInformation: 0.5, likelyToProgress: 0.5, strategyChangeNeeded: 0.5 } } }];
    const audit = computeStagnationDecisionAudit({ events, athenaConfig: config, coreModule });
    expect(audit).toHaveLength(1);
    expect(typeof audit[0].compositeScore).toBe("number");
    expect(audit[0].frozenPolicy.decision).toBe("allow");
  });
});

describe("restored runner regressions", () => {
  it("parses real OpenCode 1.18.31 JSONL capture", async () => {
    const stream = await readFile(join(process.cwd(), "bench/test/fixtures/opencode-1.18.31-real.jsonl"), "utf8");
    const trace = parseHostTrace(stream);
    expect(trace.some((record) => record.type === "action" && record.tool === "bash")).toBe(true);
    expect(finalAssistantMessage(trace)).toBe("Completed review.");
    expect(hostMetrics(trace).llmTurns).not.toBeNull();
  });

  it("terminates a timed out process with SIGTERM", async () => {
    const execution = await executeProcess({ command: process.execPath, args: ["--eval", "setInterval(() => {}, 1000)"], cwd: process.cwd(), timeoutMs: 20, env: process.env });
    expect(execution.timedOut).toBe(true);
    expect(execution.terminationSignal).toBe("SIGTERM");
  });

  it("escalates a SIGTERM-resistant process to SIGKILL", async () => {
    const execution = await executeProcess({ command: "/bin/sh", args: ["-c", "trap '' TERM; while :; do :; done"], cwd: process.cwd(), timeoutMs: 200, env: process.env });
    expect(execution.timedOut).toBe(true);
    expect(execution.terminationSignal).toBe("SIGKILL");
    expect(execution.forcedKill).toBe(true);
  }, 5_000);

  it("records validator SIGTERM timeout", async () => {
    const root = await mkdtemp(join(tmpdir(), "athena-validator-term-"));
    const validated = await validateRun({ fixtureRoot: root, runRoot: root, validator: { kind: "command", command: [process.execPath, "--eval", "setInterval(() => {}, 1000)"], expectedExit: 0 }, baselineFiles: new Map(), timeoutMs: 20 });
    expect(validated.success).toBe(false);
    expect(validated.evidence[0].terminationSignal).toBe("SIGTERM");
  });

  it("records validator SIGKILL escalation", async () => {
    const root = await mkdtemp(join(tmpdir(), "athena-validator-kill-"));
    const validated = await validateRun({ fixtureRoot: root, runRoot: root, validator: { kind: "command", command: ["/bin/sh", "-c", "trap '' TERM; while :; do :; done"], expectedExit: 0 }, baselineFiles: new Map(), timeoutMs: 200 });
    expect(validated.evidence[0].terminationSignal).toBe("SIGKILL");
    expect(validated.evidence[0].forcedKill).toBe(true);
  }, 5_000);

  it("redacts secrets, authorization headers, and contextual paths", () => {
    const value = redact(`token=top-secret Authorization: Bearer abc.def /tmp/bench/work/file ${join(process.cwd(), "a")}`, { workdirRoot: "/tmp/bench/work" });
    expect(value).not.toContain("top-secret");
    expect(value).not.toContain("abc.def");
    expect(value).toContain("$WORKDIR");
    expect(value).toContain("$REPO");
  });

  it("keeps frozen runtime isolated from working tree tampering", async () => {
    const root = await mkdtemp(join(tmpdir(), "athena-frozen-graph-"));
    const runtime = await frozenRuntime(root);
    await expect(assertFrozenRuntimeGraph(root)).resolves.toBe(runtime.entrypoint);
  });

  it("rejects manifest harness, fixture, and validator drift", () => {
    const plan = planExperiment({ caseDefinition: { id: "fixture" }, replicates: 1, seed: 1, model: "m", timeoutMs: 1000, experimentId: "e" });
    const base = { schemaVersion: "1.2", benchmarkHarnessFingerprint: h, productionArtifactFingerprint: h, athenaFrozenCommit: FROZEN_ATHENA_COMMIT, model: "m", modelConfig: { model: "m" }, timeoutMs: 1000, seed: 1, pairs: plan.pairs, cases: [{ caseId: "fixture", fixtureFingerprint: h, taskPromptHash: h, caseDefinitionFingerprint: h, requestedNetworkPolicy: "offline", requestedTools: ["read"], dataset: "development", category: "test-fix" }] };
    expect(manifestCompatibility(base, { ...base, benchmarkHarnessFingerprint: "b".repeat(64) }).compatible).toBe(false);
    expect(manifestCompatibility(base, { ...base, cases: [{ ...base.cases[0], fixtureFingerprint: "b".repeat(64) }] }).compatible).toBe(false);
    expect(manifestCompatibility(base, { ...base, cases: [{ ...base.cases[0], caseDefinitionFingerprint: "b".repeat(64) }] }).compatible).toBe(false);
  });

  it("enforces pair and agent run budgets", () => {
    const sample = { id: "fixture" };
    expect(() => planExperiment({ caseDefinition: sample, replicates: 11, seed: 1, model: "m", timeoutMs: 1000, experimentId: "e" })).toThrow("Run budget exceeded");
    expect(() => planExperiment({ caseDefinitions: Array.from({ length: 11 }, (_, index) => ({ id: `case-${index}` })), replicates: 1, seed: 1, model: "m", timeoutMs: 1000, experimentId: "e" })).toThrow("Run budget exceeded");
  });

  it("requires programmatic live confirmation before setup", async () => {
    const plan = { experimentId: "e", pairs: [] };
    await expect(runPair({ caseId: "fixture", experimentPlan: plan })).rejects.toThrow("confirmLive: true");
  });

  it("dry run never invokes OpenCode run sentinel", async () => {
    const root = await mkdtemp(join(tmpdir(), "athena-dry-run-"));
    const bin = join(root, "bin"); const sentinel = join(root, "opencode-run-called");
    await mkdir(bin); await writeFile(join(bin, "opencode"), `#!/bin/sh\nif [ "$1" = "run" ]; then touch ${sentinel}; fi\necho 1.18.31\n`); await chmod(join(bin, "opencode"), 0o755);
    const caseDefinition = await loadCase("controlled-semantic-loop");
    const plan = planExperiment({ caseDefinition, replicates: 1, seed: 1, model: "openai/gpt-5.6-terra", timeoutMs: caseDefinition.timeoutMs, experimentId: `dry-${Date.now()}` });
    const frozen = await prepareFrozenRuntime(); const resultRoot = join(root, "results"); await mkdir(join(resultRoot, "runs"), { recursive: true }); await mkdir(join(resultRoot, "raw"));
    const manifest = experimentManifest({ plan, benchmarkCommit: "test", frozenProductionDifferences: [], productionRuntime: frozen, benchmarkHarnessFingerprint: h, cases: [] });
    const oldPath = process.env.PATH; process.env.PATH = `${bin}:${oldPath}`;
    try {
      await runPair({ caseId: caseDefinition.id, replicate: 1, seed: 1, timeoutMs: caseDefinition.timeoutMs, model: "openai/gpt-5.6-terra", dryRun: true, experimentPlan: plan, experimentSetup: { caseDefinitions: new Map([[caseDefinition.id, caseDefinition]]), productionRuntime: frozen, harnessFingerprint: h, benchmarkCommit: "test", resultRoot, manifestPath: join(resultRoot, "manifest.json"), manifest } });
    } finally { process.env.PATH = oldPath; }
    await expect(access(sentinel)).rejects.toThrow();
  }, 15_000);

  it("rejects malformed result artifacts in analysis", () => {
    const analysis = analyzeRuns([{ runId: "bad", schemaVersion: "broken" }], { pairs: [] });
    expect(analysis.artifactValidationErrors).toHaveLength(1);
    expect(analysis.validPairs).toHaveLength(0);
  });

  it("exports malformed CSV fields safely", () => {
    const analysis = { artifactValidationErrors: [{ runId: "bad", reason: "bad,\"artifact\"" }], pairs: [] };
    expect(summaryCsv([{ runId: "bad", pairId: "p", arm: "control" }], analysis)).toContain('"bad,""artifact"""');
  });

  it("reports missing and incomplete pairs", () => {
    const control = result("control");
    const plan = { pairs: [{ pairId: control.pairId, runs: [{ runId: control.runId, arm: "control" }, { runId: `${control.pairId}-treatment`, arm: "treatment" }] }] };
    const analysis = analyzeRuns([control], plan);
    expect(analysis.invalidPairs).toHaveLength(1);
  });

  it("preserves unknown provider metrics as null", async () => {
    const root = await mkdtemp(join(tmpdir(), "athena-provider-null-"));
    const telemetry = await import("../runners/index.mjs").then((module) => module.athenaTelemetry(root));
    expect(telemetry.jevCalls).toBeNull();
    expect(telemetry.jevFailures).toBeNull();
  });

  it("invalidates a TypeSafe-configured treatment with demo provider evidence", () => {
    const control = result("control");
    const treatment = result("treatment");
    treatment.runtimeEvidence.athenaProvider = "typesafe";
    treatment.runtimeEvidence.providerCallVisibility = "observed";
    treatment.athenaTelemetrySummary = { ...treatment.athenaTelemetrySummary, reflexCompleted: 1, jevCalls: 1, providerNames: ["demo"] };
    expect(validatePair([control, treatment]).pairValid).toBe(false);
  });

  it("rejects control ATHENA-path false positives", () => {
    const control = result("control");
    const treatment = result("treatment");
    control.runtimeEvidence.athenaAbsent = false;
    expect(validatePair([control, treatment]).pairValid).toBe(false);
  });

  it("normalizes actual R2 observed tool names without allowing unknown tools", () => {
    const good = verifyToolIsolation({ requestedTools: ["read", "write", "shell"], observedTools: ["read", "glob", "grep", "apply_patch", "bash"], policyConfigFingerprint: h, expectedFingerprint: h });
    expect(good.verified).toBe(true);
    expect(good.normalizedObservedTools).toContain("edit");
    const bad = verifyToolIsolation({ requestedTools: ["read"], observedTools: ["todowrite", "unknown-tool"], policyConfigFingerprint: h, expectedFingerprint: h });
    expect(bad.verified).toBe(false);
    expect(bad.outOfPolicyObservedTools).toEqual(expect.arrayContaining(["todowrite", "unknown-tool"]));
  });

  it("measures model-visible hidden ATHENA and OpenCode artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "athena-visible-"));
    await writeFile(join(root, "task.txt"), "task");
    const baseline = await modelVisibleInputFingerprint(root);
    await mkdir(join(root, ".athena")); await writeFile(join(root, ".athena", "test"), "x");
    expect(await modelVisibleInputFingerprint(root)).not.toBe(baseline);
    await rm(join(root, ".athena"), { recursive: true }); await mkdir(join(root, ".opencode")); await writeFile(join(root, ".opencode", "test"), "x");
    expect(await modelVisibleInputFingerprint(root)).not.toBe(baseline);
  });

  it("invalidates pairs with model-visible hidden artifacts", () => {
    const control = result("control"); const treatment = result("treatment");
    treatment.environmentMetadata.modelVisibleEnvironment.athenaArtifactsPresent = true;
    treatment.environmentMetadata.modelVisibleEnvironment.verifiedEquivalentInput = false;
    expect(validatePair([control, treatment]).pairValid).toBe(false);
  });

  it("attributes replans only until next stagnation evaluation", async () => {
    const { coreModule } = await importFrozenCore();
    const allow = { sameStrategy: 0.1, sameUnderlyingProblem: 0.1, surfaceVariation: 0.1, newInformation: 0.9, likelyToProgress: 0.9, strategyChangeNeeded: 0.1 };
    const replan = { sameStrategy: 0.9, sameUnderlyingProblem: 0.9, surfaceVariation: 0.8, newInformation: 0.2, likelyToProgress: 0.2, strategyChangeNeeded: 0.9 };
    const events = [
      { type: "REFLEX_COMPLETED", timestamp: "2026-01-01T00:00:01.000Z", sessionId: "s", metadata: { reflex: "stagnation", scores: allow } },
      { type: "REFLEX_STARTED", timestamp: "2026-01-01T00:00:02.000Z", sessionId: "s", metadata: { reflex: "stagnation" } },
      { type: "REFLEX_COMPLETED", timestamp: "2026-01-01T00:00:03.000Z", sessionId: "s", metadata: { reflex: "stagnation", scores: replan } },
      { type: "REPLAN_REQUESTED", timestamp: "2026-01-01T00:00:04.000Z", sessionId: "s", metadata: {} },
      { type: "REPLAN_QUEUED", timestamp: "2026-01-01T00:00:05.000Z", sessionId: "s", metadata: {} },
    ];
    const audit = computeStagnationDecisionAudit({ events, athenaConfig: { mode: "balanced", thresholds: { stagnation: 0.75 } }, coreModule });
    expect(audit).toHaveLength(2);
    expect(audit[0].policyMatchesObserved).toBe(true);
    expect(audit[1].policyMatchesObserved).toBe(true);
  });

  it("rejects a stagnation event without scores", async () => {
    const { coreModule } = await importFrozenCore();
    expect(() => computeStagnationDecisionAudit({ events: [{ type: "REFLEX_COMPLETED", timestamp: "2026-01-01T00:00:00.000Z", sessionId: "s", metadata: { reflex: "stagnation" } }], athenaConfig: { thresholds: { stagnation: 0.75 } }, coreModule })).toThrow("missing scores");
  });
});

describe("zero-model isolation gate", () => {
  it("generates explicit deny entries for every unrequested OpenCode category", () => {
    const policy = generateOpenCodeConfig(["read"]).permission;
    expect(policy).toMatchObject({ read: "allow", glob: "allow", grep: "allow", edit: "deny", apply_patch: "deny", bash: "deny", todowrite: "deny", task: "deny", skill: "deny", lsp: "deny", question: "deny", webfetch: "deny", websearch: "deny", external_directory: "deny" });
  });

  it("allows only explicit write permission names", () => {
    const policy = generateOpenCodeConfig(["write"]).permission;
    expect(policy.edit).toBe("allow");
    expect(policy.apply_patch).toBe("allow");
    expect(policy.read).toBe("deny");
    expect(policy.bash).toBe("deny");
  });

  it("allows only explicit shell permission names", () => {
    const policy = generateOpenCodeConfig(["shell"]).permission;
    expect(policy.bash).toBe("allow");
    expect(policy.edit).toBe("deny");
    expect(policy.read).toBe("deny");
  });

  it("rejects manifest schema-version drift", () => {
    const manifest = { schemaVersion: "1.1", benchmarkHarnessFingerprint: h, productionArtifactFingerprint: h, athenaFrozenCommit: FROZEN_ATHENA_COMMIT, model: "m", modelConfig: {}, timeoutMs: 1000, seed: 1, pairs: [], cases: [] };
    expect(manifestCompatibility(manifest, { ...manifest, schemaVersion: "1.2" }).conflicts.map((conflict) => conflict.field)).toContain("schemaVersion");
  });

  it("analyzes historical 1.1 artifacts without schema-1.2 validation", () => {
    const historical = { ...result("control"), schemaVersion: "1.1", environmentMetadata: { requestedNetworkPolicy: "offline", networkIsolationVerified: true, requestedTools: ["read"], toolsIsolationVerified: true, orderSeed: 1, order: ["control", "treatment"], modelVisibleInputFingerprint: h } };
    expect(analyzeRuns([historical], { pairs: [] }).artifactValidationErrors).toHaveLength(0);
  });

  it("rejects invalid CLI numeric input before benchmark setup", async () => {
    await expect(exec(process.execPath, ["bench/runners/cli.mjs", "pair", "--case", "controlled-semantic-loop", "--replicates", "0"], { cwd: process.cwd() })).rejects.toMatchObject({ stderr: expect.stringContaining("replicates must be a positive integer") });
  });

  it("requires CLI --confirm-live unless dry-run is selected", async () => {
    await expect(exec(process.execPath, ["bench/runners/cli.mjs", "pair", "--case", "controlled-semantic-loop"], { cwd: process.cwd() })).rejects.toMatchObject({ stderr: expect.stringContaining("Live benchmark requires --confirm-live") });
  });

  it("validates case shape before execution", () => {
    expect(() => validateCase({ id: "bad" })).toThrow();
  });

  it("merges host and ATHENA traces chronologically", () => {
    const trace = mergeTrace([{ source: "host", order: 0, timestamp: 1, type: "action", tool: "read" }], [{ timestamp: "1970-01-01T00:00:00.002Z", type: "REFLEX_COMPLETED", metadata: {} }]);
    expect(trace.map((item) => item.source)).toEqual(["host", "athena"]);
  });

  it("requires wrapper initialization and hook firing for activation", async () => {
    const root = await mkdtemp(join(tmpdir(), "athena-probe-"));
    const probe = join(root, "probe.jsonl");
    await writeFile(probe, ["wrapper-initialized", "frozen-runtime-imported"].map((type) => JSON.stringify({ type })).concat([JSON.stringify({ type: "athena-v1-initialized", registeredHooks: ["tool.execute.before"] }), JSON.stringify({ type: "hook-fired", name: "tool.execute.before" })]).join("\n"));
    expect((await pluginActivationEvidence(probe, true)).active).toBe(true);
  });

  it("runs actual Docker sandbox probes and hides sibling state from shell", async () => {
    const sandbox = await createDockerSandbox();
    const root = await mkdtemp(join(homedir(), "athena-docker-"));
    const workspace = join(root, "workspace"); const hostConfig = join(root, "host-config"); const state = join(root, "athena-state"); const probe = join(root, "probe"); const shellHome = join(root, "shell-home");
    await Promise.all([workspace, hostConfig, state, probe, shellHome].map((path) => mkdir(path, { recursive: true })));
    await writeFile(join(workspace, "visible.txt"), "visible"); await writeFile(join(hostConfig, "secret"), "hidden"); await writeFile(join(state, "secret"), "hidden"); await writeFile(join(probe, "secret"), "hidden");
    const environment = { ATHENA_BENCH_SHELL_HOME: shellHome, ATHENA_BENCH_WORK_ROOT: root, ATHENA_BENCH_WORKSPACE_ROOT: workspace, TYPESAFE_API_KEY: "present-for-host" };
    const probes = await probeDockerSandbox(sandbox, workspace, state, probe, environment);
    expect(probes.localProbePassed).toBe(true);
    expect(probes.workspaceReadPassed).toBe(true);
    expect(probes.workspaceWritePassed).toBe(true);
    expect(probes.networkProbeBlocked).toBe(true);
    expect(probes.hiddenStateProbePassed).toBe(true);
    expect(probes.secretScrubProbePassed).toBe(true);
    expect(probes.dockerSocketMounted).toBe(false);
    expect(probes.verified).toBe(true);
    await rm(sandbox.wrapperDir, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }, 15_000);

  it("prepares isolated host OAuth home and distinct shell home", async () => {
    const root = await mkdtemp(join(tmpdir(), "athena-homes-"));
    const homes = await prepareHostHomes(root);
    expect(homes.hostHome).not.toBe(homes.shellHome);
    expect(await access(homes.hostHome).then(() => true)).toBe(true);
    expect(await access(homes.shellHome).then(() => true)).toBe(true);
  });

  it("writes balanced config at hidden .athena/config.json", async () => {
    const root = await mkdtemp(join(tmpdir(), "athena-state-config-"));
    const frozen = await prepareFrozenRuntime();
    const state = join(root, "state");
    await prepareArm({ caseDefinition: { fixture: "controlled-semantic-loop", requestedTools: ["read"] }, arm: "treatment", workspaceRoot: join(root, "workspace"), hostConfigRoot: join(root, "config"), athenaStateRoot: state, productionRuntime: frozen });
    expect(JSON.parse(await readFile(join(state, ".athena", "config.json"), "utf8")).mode).toBe("balanced");
  });

  it("reads telemetry only from hidden .athena/events.jsonl", async () => {
    const root = await mkdtemp(join(tmpdir(), "athena-state-events-"));
    await mkdir(join(root, ".athena"));
    await writeFile(join(root, ".athena", "events.jsonl"), `${JSON.stringify({ type: "REFLEX_COMPLETED", timestamp: "2026-01-01T00:00:00.000Z", sessionId: "s", metadata: { reflex: "stagnation", provider: "typesafe", latencyMs: 1 } })}\n`);
    const telemetry = await athenaTelemetry(root);
    expect(telemetry.active).toBe(true);
    expect(telemetry.metisEvaluations).toBe(1);
    expect(telemetry.providerNames).toEqual(["typesafe"]);
  });
});
