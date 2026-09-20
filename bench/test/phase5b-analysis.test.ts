import { describe, expect, it } from "vitest";
// @ts-expect-error JavaScript analysis module has no declaration output.
import { clusteredBootstrapCI, signFlipTest, holmAdjust, buildMatchedPairs, computeConfirmatoryAdjustment, computeH1, computeH2, computeH3, computeH4 } from "../analysis/phase5b.mjs";

type PairOptions = { cs?: boolean; ts?: boolean; ct?: number; tt?: number; category?: string; replans?: number };

function pair(caseId: string, replicate: number, { cs = true, ts = true, ct = 100, tt = 100, category = "semantic-loop", replans = 0 }: PairOptions = {}) {
  const pairId = `${caseId}-r${replicate}`;
  return {
    pairId, caseId, category,
    control: { pairId, runId: `${pairId}-control`, caseId, category, arm: "control", status: "completed", durationMs: 1000, metrics: { taskSuccess: cs, hostTokens: { total: ct }, toolCalls: 2, llmTurns: 2, failedToolCalls: 0 }, athenaTelemetrySummary: {} },
    treatment: { pairId, runId: `${pairId}-treatment`, caseId, category, arm: "treatment", status: "completed", durationMs: 1100, metrics: { taskSuccess: ts, hostTokens: { total: tt }, toolCalls: 3, llmTurns: 2, failedToolCalls: 0 }, athenaTelemetrySummary: { replanLifecycle: { injected: replans } } },
  };
}

describe("Phase 5B pre-registered statistics", () => {
  it("bootstrap resamples tasks deterministically", () => {
    const tasks = [{ x: 1 }, { x: 2 }, { x: 10 }];
    const a = clusteredBootstrapCI(tasks, (sample: Array<{ x: number }>) => sample.reduce((s, v) => s + v.x, 0) / sample.length, 500, 42);
    const b = clusteredBootstrapCI(tasks, (sample: Array<{ x: number }>) => sample.reduce((s, v) => s + v.x, 0) / sample.length, 500, 42);
    expect(a).toEqual(b);
    expect(a.unit).toBe("task");
  });

  it("H1 weights tasks equally rather than replicate pairs", () => {
    const pairs = [pair("a", 1, { cs: false, ts: true }), pair("a", 2, { cs: false, ts: true }), pair("a", 3, { cs: false, ts: true }), pair("b", 1, { cs: true, ts: false })];
    const h1 = computeH1(pairs);
    expect(h1.nTasks).toBe(2);
    expect(h1.nMatchedReplicates).toBe(4);
    expect(h1.effect).toBeCloseTo(0, 12); // task A +1, task B -1
  });

  it("H3 clusters token ratios by task", () => {
    const pairs = [pair("a", 1, { ct: 100, tt: 50 }), pair("a", 2, { ct: 100, tt: 50 }), pair("a", 3, { ct: 100, tt: 50 }), pair("b", 1, { ct: 100, tt: 200 })];
    const h3 = computeH3(pairs);
    expect(h3.nTasks).toBe(2);
    expect(h3.geometricMeanRatio).toBeCloseTo(1, 12); // equal task weighting: 0.5 and 2.0
    expect(h3.medianRawPairedDelta).toBe(-50);
  });

  it("H2 uses blind run labels and negative delta means loop reduction", () => {
    const pairs = [pair("lp-01", 1), pair("lp-01", 2), pair("lp-02", 1)];
    const loopWindows = [];
    for (const p of pairs) {
      loopWindows.push({ runId: p.control.runId, label: "LOOP" });
      loopWindows.push({ runId: p.treatment.runId, label: "PROGRESS" });
    }
    const h2 = computeH2(pairs, { loopWindows });
    expect(h2.effect).toBe(-1);
    expect(h2.reduction).toBe(1);
    expect(h2.test.method).toBe("exact-sign-flip");
  });

  it("H2 stays available with supplied but empty blind labels and reports exclusions", () => {
    const h2 = computeH2([pair("lp-01", 1)], { loopWindows: [] });
    expect(h2.pendingAnnotations).toBe(false);
    expect(h2.nMatchedReplicates).toBe(0);
    expect(h2.missing).toEqual([{ pairId: "lp-01-r1", caseId: "lp-01", reason: "missing-or-uncertain-loop-label" }]);
  });

  it("Holm correction is monotone", () => {
    const adjusted = holmAdjust({ H1: 0.03, H2: 0.04 });
    expect(adjusted.H1).toBeCloseTo(0.06, 12);
    expect(adjusted.H2).toBeCloseTo(0.06, 12);
  });

  it("Holm adjustment uses sorted family rank and stays pending until both tests are finite", () => {
    expect(holmAdjust({ H1: 0.01, H2: 0.03, H3: 0.04 })).toEqual({ H1: 0.03, H2: 0.06, H3: 0.06 });
    expect(computeConfirmatoryAdjustment({ test: { pValue: 0.01 } }, { test: { pValue: Number.NaN } })).toMatchObject({ pending: true });
  });

  it("H4 does not classify every legitimate-progress replan as false", () => {
    const p1 = pair("lp-13", 1, { category: "legitimate-progress", replans: 1 });
    const p2 = pair("lp-14", 1, { category: "legitimate-progress", replans: 1 });
    const h4 = computeH4([p1, p2], { replanWindows: [{ runId: p1.treatment.runId, label: "PROGRESS" }, { runId: p2.treatment.runId, label: "LOOP" }] });
    expect(h4.unnecessary).toBe(1);
    expect(h4.justified).toBe(1);
    expect(h4.falseReplanRateAmongAdjudicated).toBe(0.5);
    expect(h4.unnecessaryReplansPerTreatmentRun).toBe(0.5);
  });

  it("H4 is pending only for injected replans without blind labels", () => {
    const noReplan = computeH4([pair("lp-13", 1, { category: "legitimate-progress" })]);
    const missingBlindLabel = computeH4([pair("lp-13", 1, { category: "legitimate-progress", replans: 1 })]);
    expect(noReplan).toMatchObject({ pendingAnnotations: false, unlabeled: 0, unnecessaryReplansPerTreatmentRun: 0 });
    expect(missingBlindLabel).toMatchObject({ pendingAnnotations: true, unlabeled: 1 });
  });

  it("sign-flip is deterministic", () => {
    const effects = Array.from({ length: 30 }, (_, i) => (i % 3) - 1);
    expect(signFlipTest(effects, { permutations: 1000, seed: 4242 })).toEqual(signFlipTest(effects, { permutations: 1000, seed: 4242 }));
  });

  it("infrastructure-invalid arms are excluded explicitly", () => {
    const p = pair("lp-01", 1);
    p.treatment.status = "invalid";
    const built = buildMatchedPairs([p.control, p.treatment]);
    expect(built.validPairs).toHaveLength(0);
    expect(built.invalidPairs[0].reasons).toContain("treatment-infrastructure-invalid");
  });
});
