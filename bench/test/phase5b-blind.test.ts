import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBlindAnnotationPacket, cohenKappa, loadAdjudicatedAnnotations, sanitizeTrace } from "../analysis/blind-exporter.mjs";
import { detectLoops, FROZEN_REPETITION_WINDOW_SIZE, FROZEN_REPETITION_SIMILARITY_THRESHOLD } from "../analysis/baselines/repetition-detector.mjs";
import { computeH2, computeH4 } from "../analysis/phase5b.mjs";

const failedAction = (input, order) => ({ source: "host", order, timestamp: order, type: "action", tool: "Bash", category: "shell", input, result: "command failed", success: false, sessionID: "session-secret-123" });

describe("Phase 5B blind annotation and frozen baseline", () => {
  it("freezes local repetition windows and ignores successes", () => {
    const repeated = Array.from({ length: FROZEN_REPETITION_WINDOW_SIZE }, (_, index) => failedAction("pnpm install", index));
    expect(FROZEN_REPETITION_WINDOW_SIZE).toBe(5);
    expect(FROZEN_REPETITION_SIMILARITY_THRESHOLD).toBe(0.8);
    expect(detectLoops(repeated)).toEqual([{ startIndex: 0, endIndex: 4, toolFamily: "shell", repetitionCount: 5, similarity: 0.8, label: "LOOP" }]);
    expect(detectLoops([...repeated.slice(0, 4), { ...repeated[4], success: true }])).toEqual([]);
  });

  it("exports semantic blind windows, opaque IDs, and separate identity key", async () => {
    const root = await mkdtemp(join(tmpdir(), "phase5b-blind-"));
    const rawDir = join(root, "results", "raw");
    const outputDir = join(root, "annotations");
    await mkdir(rawDir, { recursive: true });
    const trace = Array.from({ length: 5 }, (_, index) => failedAction("pnpm install --retry", index));
    trace.push({ source: "athena", type: "athena-event", timestamp: 6, event: { type: "REPLAN_CONTEXT_APPLIED", metadata: { sessionId: "secret" } } });
    await writeFile(join(rawDir, "treatment-run-secret.jsonl"), `${trace.map(JSON.stringify).join("\n")}\n`);

    const { packet, key } = await createBlindAnnotationPacket(join(root, "results"), outputDir);
    const persistedPacket = await readFile(join(outputDir, "annotation-packet.json"), "utf8");
    expect(packet).toHaveLength(2);
    expect(packet[0].traceWindow[0].action).toContain("pnpm install");
    expect(persistedPacket).not.toMatch(/treatment-run-secret|session-secret|REPLAN|athena|treatment|control/i);
    expect(JSON.stringify(key)).toContain("treatment-run-secret");
    expect(packet.map((row) => row.annotationId)).toEqual(["A0001", "A0002"]);
  });

  it("removes control and identity text but keeps action semantics", () => {
    const [record] = sanitizeTrace([failedAction("read /work/ATHENA/session-abcdef12/config for compile error", 0)]);
    expect(record.action).toContain("compile error");
    expect(record.action).not.toMatch(/ATHENA|session-abcdef12|\/work\//i);
  });

  it("calculates Cohen kappa and loads H2/H4 adjudications through opaque IDs", async () => {
    const root = await mkdtemp(join(tmpdir(), "phase5b-labels-"));
    const annotations = [
      { annotationId: "loop-id", raterId: "rater-a", label: "LOOP" },
      { annotationId: "loop-id", raterId: "rater-b", label: "LOOP" },
      { annotationId: "progress-id", raterId: "rater-a", label: "PROGRESS" },
      { annotationId: "progress-id", raterId: "rater-b", label: "PROGRESS" },
      { annotationId: "replan-id", raterId: "rater-a", label: "PROGRESS" },
      { annotationId: "replan-id", raterId: "rater-b", label: "LOOP" },
    ];
    expect(cohenKappa(annotations).n).toBe(3);
    await writeFile(join(root, "labels.json"), JSON.stringify({ annotations, adjudications: [{ annotationId: "loop-id", label: "LOOP" }, { annotationId: "progress-id", label: "PROGRESS" }, { annotationId: "replan-id", label: "PROGRESS" }] }));
    await writeFile(join(root, "key.json"), JSON.stringify([{ annotationId: "loop-id", kind: "loop", runId: "control-run" }, { annotationId: "progress-id", kind: "loop", runId: "treatment-run" }, { annotationId: "replan-id", kind: "replan", runId: "treatment-progress-run" }]));
    const loaded = await loadAdjudicatedAnnotations(join(root, "labels.json"), join(root, "key.json"));
    expect(loaded).toMatchObject({ loopWindows: [{ runId: "control-run", label: "LOOP" }, { runId: "treatment-run", label: "PROGRESS" }], replanWindows: [{ runId: "treatment-progress-run", label: "PROGRESS" }], singleAnnotator: false });
    const h2Pair = { category: "semantic-loop", pairId: "loop-pair", caseId: "loop-case", control: { runId: "control-run" }, treatment: { runId: "treatment-run" } };
    const h4Pair = { category: "legitimate-progress", treatment: { runId: "treatment-progress-run", athenaTelemetrySummary: { replanLifecycle: { injected: 1 } } } };
    expect(computeH2([h2Pair], loaded).effect).toBe(-1);
    expect(computeH4([h4Pair], loaded).unnecessary).toBe(1);
  });
});
