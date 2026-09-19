import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error JavaScript benchmark runner has no declaration output.
import { FROZEN_ATHENA_COMMIT, assertFrozenProduction, assertResumeCompatible, completionDeclaration, finalAssistantMessage, findExistingRun, fingerprintFixture, hostMetrics, mergeTrace, orderedArms, parseHostTrace, planExperiment, prepareArm, promptHash, redact, runKey, validateCase, validatePair, validateResult } from "../runners/index.mjs";
// @ts-expect-error JavaScript benchmark analysis has no declaration output.
import { analyzeRuns, median } from "../analysis/summary.mjs";

const sampleCase = { id: "fixture", title: "Fixture", category: "test-fix", description: "Test", fixture: "fixture", taskPrompt: "Test", validator: { kind: "file-present", path: "proof.md" }, timeoutMs: 1000, expectedBehavior: "Test", tags: [], difficulty: "easy", requestedNetworkPolicy: "offline", requestedTools: ["read"], dataset: "development" };
const result = (arm: "control" | "treatment", pairId = "fixture-r01") => ({ schemaVersion: "1.1", experimentId: "experiment", pairId, runId: `${pairId}-${arm}`, caseId: "fixture", arm, status: "completed", benchmarkCommit: "a", athenaFrozenCommit: FROZEN_ATHENA_COMMIT, host: "OpenCode", hostVersion: "1.18.31", model: "openai/gpt-5.6-terra", modelConfig: { model: "openai/gpt-5.6-terra", seedControl: "unsupported" }, fixtureFingerprint: "a".repeat(64), taskPromptHash: "b".repeat(64), timeoutMs: 1000, requestedTools: ["read"], startedAt: "now", finishedAt: "now", durationMs: arm === "control" ? 10 : 20, metrics: { taskSuccess: true, toolCalls: arm === "control" ? 2 : 4, llmTurns: 1, failedToolCalls: 0, prematureCompletion: null }, validator: {}, runtimeEvidence: { athenaAbsent: arm === "control" }, athenaTelemetrySummary: { active: arm === "treatment", replan: 0, reflexCompleted: 0, jevCalls: null }, environmentMetadata: {} });

describe("benchmark harness", () => {
  it("strictly validates case and result schemas", () => {
    expect(validateCase(sampleCase).id).toBe("fixture");
    expect(() => validateCase({ ...sampleCase, category: "unknown" })).toThrow();
    expect(() => validateCase({ ...sampleCase, validator: { kind: "command" } })).toThrow();
    expect(validateResult(result("control")).arm).toBe("control");
    expect(() => validateResult({ ...result("control"), athenaFrozenCommit: "wrong" })).toThrow();
  });

  it("allows benchmark-only freeze state and blocks production differences", async () => {
    await expect(assertFrozenProduction(true, [])).resolves.toEqual([]);
    await expect(assertFrozenProduction(true, ["packages/core/src/index.ts"])).rejects.toThrow(FROZEN_ATHENA_COMMIT);
  });

  it("plans all replicate pairs under one experiment identifier", () => {
    const plan = planExperiment({ caseDefinition: sampleCase, replicates: 2, seed: 7, model: "openai/gpt-5.6-terra", timeoutMs: 1000, experimentId: "one-experiment" });
    expect(plan.experimentId).toBe("one-experiment");
    expect(plan.agentRuns).toBe(4);
    expect(plan.pairs.map((pair: { pairId: string }) => pair.pairId)).toEqual(["fixture-r01", "fixture-r02"]);
    expect(new Set([runKey("fixture-r01", "control"), runKey("fixture-r01", "treatment"), runKey("fixture-r02", "control"), runKey("fixture-r02", "treatment")]).size).toBe(4);
    const runs = [result("control", "fixture-r01"), result("treatment", "fixture-r01"), result("control", "fixture-r02"), result("treatment", "fixture-r02")];
    expect(findExistingRun(runs, "fixture-r02", "control")?.runId).toBe("fixture-r02-control");
    expect(() => planExperiment({ caseDefinition: sampleCase, replicates: 11, seed: 1, model: "x", timeoutMs: 1000, experimentId: "too-many" })).toThrow("Run budget");
  });

  it("rejects incompatible resume definitions", () => {
    const plan = planExperiment({ caseDefinition: sampleCase, replicates: 1, seed: 1, model: "m", timeoutMs: 1000, experimentId: "e" });
    expect(() => assertResumeCompatible(plan, { ...plan, model: "other" })).toThrow("Resume conflict: model");
    expect(() => assertResumeCompatible(plan, plan)).not.toThrow();
  });

  it("fingerprints isolated fixtures and installs ATHENA only for treatment", async () => {
    const root = await mkdtemp(join(tmpdir(), "athena-bench-"));
    await mkdir(join(root, "a")); await mkdir(join(root, "b")); await writeFile(join(root, "a", "fixture.txt"), "same"); await writeFile(join(root, "b", "fixture.txt"), "same");
    expect(await fingerprintFixture(join(root, "a"))).toBe(await fingerprintFixture(join(root, "b")));
    const control = join(root, "control"); const treatment = join(root, "treatment");
    await prepareArm({ caseDefinition: { fixture: "controlled-semantic-loop" }, arm: "control", target: control }); await prepareArm({ caseDefinition: { fixture: "controlled-semantic-loop" }, arm: "treatment", target: treatment });
    await expect(readFile(join(control, ".opencode", "plugins", "athena.ts"), "utf8")).rejects.toThrow();
    expect(await readFile(join(treatment, ".opencode", "plugins", "athena.ts"), "utf8")).toContain("AthenaV1Plugin");
  });

  it("parses sanitized real OpenCode 1.18.31 capture", async () => {
    const stream = await readFile(join(process.cwd(), "bench/test/fixtures/opencode-1.18.31-real.jsonl"), "utf8"); const trace = parseHostTrace(stream) as Array<{ toolCallID?: string; type: string; success?: boolean | null; error?: string | null; [key: string]: unknown }>; const completed = trace.find((record) => record.toolCallID === "call_completed"); const failed = trace.find((record) => record.toolCallID === "call_error");
    expect(completed).toMatchObject({ sessionID: "ses_sanitized", messageID: "msg_assistant_1", tool: "bash", stateStatus: "completed", input: '{"command":"pnpm test","workdir":"$WORKDIR"}', result: "Tests: 1 passed", success: true });
    expect(failed).toMatchObject({ messageID: "msg_assistant_2", stateStatus: "error", success: false }); expect(failed?.error).toContain("sanitized failure");
    expect(trace.filter((record) => record.type === "action" && record.success === false)).toHaveLength(1);
    expect(hostMetrics(trace)).toEqual({ sessionID: "ses_sanitized", llmTurns: 2, hostTokens: { total: 41898, input: 21745, output: 162, reasoning: 23, cacheRead: 19968, cacheWrite: 0 }, hostReportedCost: 0 });
    expect(finalAssistantMessage(trace)).toBe("Completed review."); expect(completionDeclaration(trace, false)).toBe(true); expect(completionDeclaration(trace, true)).toBe(false);
  });

  it("merges host and ATHENA trace chronologically", () => {
    const merged = mergeTrace([{ source: "host", order: 0, timestamp: 1, type: "action", tool: "bash" }, { source: "host", order: 1, timestamp: 4, type: "action", tool: "read" }], [{ timestamp: "1970-01-01T00:00:00.002Z", type: "REFLEX_COMPLETED" }, { timestamp: "1970-01-01T00:00:00.003Z", type: "REPLAN_QUEUED" }]);
    expect(merged.map((entry: { type: string; event?: { type: string } }) => entry.type === "athena-event" ? entry.event?.type : entry.type)).toEqual(["action", "REFLEX_COMPLETED", "REPLAN_QUEUED", "action"]);
  });

  it("classifies only final completion declarations", () => {
    expect(completionDeclaration([{ type: "host-output", summary: "fixed incidental text" }, { type: "assistant-text", messageID: "final", order: 1, text: "I investigated." }], false)).toBe(false);
    expect(completionDeclaration([{ type: "assistant-text", messageID: "final", order: 1, text: "Fixed the task." }], false)).toBe(true);
    expect(completionDeclaration([], false)).toBeNull();
  });

  it("redacts JSON secrets and sanitizes paths", () => {
    const value = redact('{"token":"secret","api_key":"secret","Authorization":"Bearer secret"} /home/martins/Documents/athena-jev/x');
    expect(value).not.toContain("secret"); expect(value).toContain("[REDACTED]"); expect(value).toContain("$REPO");
  });

  it("validates pairs and excludes invalid pairs from analysis", () => {
    const validRuns = [result("control", "fixture-r01"), result("treatment", "fixture-r01")]; const invalidRuns = [result("control", "fixture-r02"), { ...result("treatment", "fixture-r02"), athenaTelemetrySummary: { active: false, replan: 0, reflexCompleted: 0, jevCalls: null } }];
    expect(validatePair(validRuns).pairValid).toBe(true); expect(validatePair(invalidRuns).invalidReasons).toContain("treatment ATHENA inactive");
    expect(validatePair([{ ...result("control"), runtimeEvidence: { athenaAbsent: false } }, result("treatment")]).invalidReasons).toContain("control ATHENA absence not verified");
    const analysis = analyzeRuns([...validRuns, ...invalidRuns]); expect(analysis.control.n).toBe(1); expect(analysis.invalidPairs).toHaveLength(1); expect(median([1, 3, 5, 7])).toBe(4);
  });

  it("counterbalances deterministic order", () => { expect(orderedArms(7, 1)).not.toEqual(orderedArms(7, 2)); expect(promptHash("x")).toBe(promptHash("x")); });
});
