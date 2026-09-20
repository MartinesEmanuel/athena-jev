/* global process */
/* ATHENA Phase 5B pre-registered statistical analysis. */
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const BOOTSTRAP_RESAMPLES = 10000;
export const BOOTSTRAP_SEED = 42;
export const PERMUTATION_SAMPLES = 100000;
export const PERMUTATION_SEED = 42;

export function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function seededRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function percentile(sorted, probability) {
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(probability * sorted.length)));
  return sorted[index];
}

/** Resample TASKS, not replicate pairs. Each task record keeps its replicates clustered. */
export function clusteredBootstrapCI(tasks, statistic, resamples = BOOTSTRAP_RESAMPLES, seed = BOOTSTRAP_SEED) {
  if (!tasks.length) return { point: null, ci95Lo: null, ci95Hi: null, resamples, seed, unit: "task" };
  const rng = seededRng(seed);
  const values = [];
  for (let i = 0; i < resamples; i++) {
    const sample = Array.from({ length: tasks.length }, () => tasks[Math.floor(rng() * tasks.length)]);
    const value = statistic(sample);
    if (typeof value === "number" && Number.isFinite(value)) values.push(value);
  }
  values.sort((a, b) => a - b);
  return {
    point: statistic(tasks),
    ci95Lo: percentile(values, 0.025),
    ci95Hi: percentile(values, 0.975),
    resamples,
    seed,
    unit: "task",
  };
}

/** Two-sided paired sign-flip test on TASK-LEVEL effects. Exact when <=20 tasks. */
export function signFlipTest(taskEffects, options = {}) {
  const effects = taskEffects.filter((value) => typeof value === "number" && Number.isFinite(value));
  const observed = mean(effects);
  if (!effects.length || observed === null) return { observed: null, pValue: null, method: "unavailable", nTasks: 0 };
  const absObserved = Math.abs(observed);
  if (effects.length <= 20) {
    const combinations = 2 ** effects.length;
    let extreme = 0;
    for (let mask = 0; mask < combinations; mask++) {
      let total = 0;
      for (let i = 0; i < effects.length; i++) total += ((mask >> i) & 1 ? 1 : -1) * effects[i];
      if (Math.abs(total / effects.length) >= absObserved - Number.EPSILON) extreme++;
    }
    return { observed, pValue: extreme / combinations, method: "exact-sign-flip", permutations: combinations, nTasks: effects.length };
  }

  const permutations = options.permutations ?? PERMUTATION_SAMPLES;
  const seed = options.seed ?? PERMUTATION_SEED;
  const rng = seededRng(seed);
  let extreme = 0;
  for (let p = 0; p < permutations; p++) {
    let total = 0;
    for (const effect of effects) total += (rng() < 0.5 ? -1 : 1) * effect;
    if (Math.abs(total / effects.length) >= absObserved - Number.EPSILON) extreme++;
  }
  return {
    observed,
    pValue: (extreme + 1) / (permutations + 1),
    method: "monte-carlo-sign-flip",
    permutations,
    seed,
    nTasks: effects.length,
  };
}

export function holmAdjust(namedPValues) {
  const entries = Object.entries(namedPValues).filter(([, p]) => typeof p === "number" && Number.isFinite(p));
  const sorted = entries.sort((a, b) => a[1] - b[1]);
  let running = 0;
  const adjusted = {};
  for (let i = 0; i < sorted.length; i++) {
    const [name, p] = sorted[i];
    running = Math.max(running, Math.min(1, (sorted.length - i) * p));
    adjusted[name] = running;
  }
  return adjusted;
}

export async function loadResults(resultsDir) {
  const runsDir = join(resultsDir, "runs");
  const files = await readdir(runsDir);
  return Promise.all(files.filter((file) => file.endsWith(".json")).map(async (file) => JSON.parse(await readFile(join(runsDir, file), "utf8"))));
}

export function buildMatchedPairs(runs) {
  const byPair = new Map();
  for (const run of runs) {
    if (!run?.pairId) continue;
    if (!byPair.has(run.pairId)) byPair.set(run.pairId, []);
    byPair.get(run.pairId).push(run);
  }

  const validPairs = [];
  const invalidPairs = [];
  for (const [pairId, pairRuns] of [...byPair.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const controls = pairRuns.filter((run) => run.arm === "control");
    const treatments = pairRuns.filter((run) => run.arm === "treatment");
    const reasons = [];
    if (controls.length !== 1) reasons.push(`control-count=${controls.length}`);
    if (treatments.length !== 1) reasons.push(`treatment-count=${treatments.length}`);
    const control = controls[0];
    const treatment = treatments[0];
    if (control?.status === "invalid") reasons.push("control-infrastructure-invalid");
    if (treatment?.status === "invalid") reasons.push("treatment-infrastructure-invalid");
    if (control && treatment && control.caseId !== treatment.caseId) reasons.push("case-id-mismatch");
    if (reasons.length) {
      invalidPairs.push({ pairId, caseId: control?.caseId ?? treatment?.caseId ?? null, reasons });
      continue;
    }
    validPairs.push({ pairId, caseId: control.caseId, category: control.category, control, treatment });
  }
  return { validPairs, invalidPairs };
}

function groupByTask(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.caseId)) map.set(row.caseId, []);
    map.get(row.caseId).push(row);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function computeH1(pairs) {
  const usable = [];
  const missing = [];
  for (const pair of pairs) {
    const control = pair.control.metrics?.taskSuccess;
    const treatment = pair.treatment.metrics?.taskSuccess;
    if (typeof control !== "boolean" || typeof treatment !== "boolean") {
      missing.push({ pairId: pair.pairId, caseId: pair.caseId, reason: "missing-taskSuccess" });
      continue;
    }
    usable.push({ pairId: pair.pairId, caseId: pair.caseId, control: Number(control), treatment: Number(treatment), delta: Number(treatment) - Number(control) });
  }

  const tasks = groupByTask(usable).map(([caseId, rows]) => ({
    caseId,
    validReplicates: rows.length,
    controlSuccessRate: mean(rows.map((row) => row.control)),
    treatmentSuccessRate: mean(rows.map((row) => row.treatment)),
    delta: mean(rows.map((row) => row.delta)),
  }));
  const effect = mean(tasks.map((task) => task.delta));
  const ci = clusteredBootstrapCI(tasks, (sample) => mean(sample.map((task) => task.delta)));
  const test = signFlipTest(tasks.map((task) => task.delta));
  return { estimand: "mean task-level treatment-minus-control success-rate difference", tasks, effect, effectPercentagePoints: effect === null ? null : effect * 100, ci, test, nTasks: tasks.length, nMatchedReplicates: usable.length, missing };
}

function computeRatioOutcome(pairs, getter, label) {
  const usable = [];
  const missing = [];
  for (const pair of pairs) {
    const control = getter(pair.control);
    const treatment = getter(pair.treatment);
    if (!(typeof control === "number" && Number.isFinite(control) && control > 0 && typeof treatment === "number" && Number.isFinite(treatment) && treatment > 0)) {
      missing.push({ pairId: pair.pairId, caseId: pair.caseId, reason: `missing-or-nonpositive-${label}` });
      continue;
    }
    usable.push({ pairId: pair.pairId, caseId: pair.caseId, control, treatment, rawDelta: treatment - control, logRatio: Math.log(treatment / control) });
  }
  const tasks = groupByTask(usable).map(([caseId, rows]) => ({ caseId, validReplicates: rows.length, meanLogRatio: mean(rows.map((row) => row.logRatio)), meanRawDelta: mean(rows.map((row) => row.rawDelta)) }));
  const meanLogRatio = mean(tasks.map((task) => task.meanLogRatio));
  const ciLog = clusteredBootstrapCI(tasks, (sample) => mean(sample.map((task) => task.meanLogRatio)));
  const ratio = meanLogRatio === null ? null : Math.exp(meanLogRatio);
  return {
    tasks,
    meanLogRatio,
    geometricMeanRatio: ratio,
    percentChange: ratio === null ? null : (ratio - 1) * 100,
    ci95Ratio: ciLog.ci95Lo === null ? null : [Math.exp(ciLog.ci95Lo), Math.exp(ciLog.ci95Hi)],
    ci95PercentChange: ciLog.ci95Lo === null ? null : [(Math.exp(ciLog.ci95Lo) - 1) * 100, (Math.exp(ciLog.ci95Hi) - 1) * 100],
    medianRawPairedDelta: median(usable.map((row) => row.rawDelta)),
    bootstrap: ciLog,
    nTasks: tasks.length,
    nMatchedReplicates: usable.length,
    missing,
  };
}

export function computeH3(pairs) {
  const total = computeRatioOutcome(pairs, (run) => run.metrics?.hostTokens?.total, "hostTokens.total");
  const components = {};
  for (const key of ["input", "output", "reasoning", "cacheRead", "cacheWrite"]) {
    components[key] = computeRatioOutcome(pairs, (run) => run.metrics?.hostTokens?.[key], `hostTokens.${key}`);
  }
  return { estimand: "task-clustered geometric mean host-token ratio treatment/control", ...total, components };
}

function labelsForRun(loopWindows, runId) {
  const labels = loopWindows.filter((row) => row.runId === runId).map((row) => row.label);
  if (labels.includes("LOOP")) return 1;
  if (labels.includes("PROGRESS")) return 0;
  return null;
}

export function computeH2(pairs, annotations) {
  if (!annotations || !Object.hasOwn(annotations, "loopWindows")) {
    return { pendingAnnotations: true, reason: "No adjudicated blind loop labels supplied" };
  }
  const loopWindows = Array.isArray(annotations.loopWindows) ? annotations.loopWindows : [];
  const usable = [];
  const missing = [];
  for (const pair of pairs.filter((item) => item.category === "semantic-loop")) {
    const control = labelsForRun(loopWindows, pair.control.runId);
    const treatment = labelsForRun(loopWindows, pair.treatment.runId);
    if (control === null || treatment === null) {
      missing.push({ pairId: pair.pairId, caseId: pair.caseId, reason: "missing-or-uncertain-loop-label" });
      continue;
    }
    usable.push({ pairId: pair.pairId, caseId: pair.caseId, control, treatment, delta: treatment - control });
  }
  const tasks = groupByTask(usable).map(([caseId, rows]) => ({ caseId, validReplicates: rows.length, controlLoopRate: mean(rows.map((row) => row.control)), treatmentLoopRate: mean(rows.map((row) => row.treatment)), delta: mean(rows.map((row) => row.delta)) }));
  const effect = mean(tasks.map((task) => task.delta));
  const ci = clusteredBootstrapCI(tasks, (sample) => mean(sample.map((task) => task.delta)));
  const test = signFlipTest(tasks.map((task) => task.delta));
  return { pendingAnnotations: false, estimand: "mean task-level treatment-minus-control persistent-loop incidence", direction: "negative favors ATHENA", tasks, effect, reduction: effect === null ? null : -effect, ci, test, nTasks: tasks.length, nMatchedReplicates: usable.length, missing };
}

function injectedReplans(run) {
  const lifecycle = run.athenaTelemetrySummary?.replanLifecycle?.injected;
  if (typeof lifecycle === "number") return lifecycle;
  const legacy = run.athenaTelemetrySummary?.replan;
  return typeof legacy === "number" ? legacy : 0;
}

export function computeH4(pairs, annotations) {
  const treatmentRuns = pairs.filter((pair) => pair.category === "legitimate-progress").map((pair) => pair.treatment);
  const totalInjected = treatmentRuns.reduce((sum, run) => sum + injectedReplans(run), 0);
  if (!annotations?.replanWindows) {
    return { pendingAnnotations: totalInjected > 0, reason: totalInjected > 0 ? "Blind replan adjudication required" : null, totalInjected, unnecessary: 0, justified: 0, uncertain: 0, unlabeled: totalInjected, falseReplanRateAmongAdjudicated: null, unnecessaryReplansPerTreatmentRun: totalInjected === 0 && treatmentRuns.length ? 0 : null, treatmentRuns: treatmentRuns.length };
  }
  const runIds = new Set(treatmentRuns.map((run) => run.runId));
  const rows = annotations.replanWindows.filter((row) => runIds.has(row.runId));
  const unnecessary = rows.filter((row) => row.label === "PROGRESS").length;
  const justified = rows.filter((row) => row.label === "LOOP").length;
  const uncertain = rows.filter((row) => row.label === "UNCERTAIN").length;
  const adjudicated = unnecessary + justified;
  const unlabeled = Math.max(0, totalInjected - rows.length);
  return {
    pendingAnnotations: unlabeled > 0 || uncertain > 0,
    totalInjected,
    unnecessary,
    justified,
    uncertain,
    unlabeled,
    falseReplanRateAmongAdjudicated: adjudicated ? unnecessary / adjudicated : null,
    unnecessaryReplansPerTreatmentRun: treatmentRuns.length ? unnecessary / treatmentRuns.length : null,
    treatmentRuns: treatmentRuns.length,
    annotationCountExceedsTelemetry: rows.length > totalInjected,
  };
}

function computeDifferenceOutcome(pairs, getter, label) {
  const usable = [];
  const missing = [];
  for (const pair of pairs) {
    const control = getter(pair.control);
    const treatment = getter(pair.treatment);
    if (!(typeof control === "number" && Number.isFinite(control) && typeof treatment === "number" && Number.isFinite(treatment))) {
      missing.push({ pairId: pair.pairId, caseId: pair.caseId, reason: `missing-${label}` });
      continue;
    }
    usable.push({ pairId: pair.pairId, caseId: pair.caseId, delta: treatment - control });
  }
  const tasks = groupByTask(usable).map(([caseId, rows]) => ({ caseId, validReplicates: rows.length, delta: mean(rows.map((row) => row.delta)) }));
  return {
    meanTaskLevelDelta: mean(tasks.map((task) => task.delta)),
    medianRawPairedDelta: median(usable.map((row) => row.delta)),
    ci: clusteredBootstrapCI(tasks, (sample) => mean(sample.map((task) => task.delta))),
    nTasks: tasks.length,
    nMatchedReplicates: usable.length,
    missing,
  };
}

export function computeSecondaryOutcomes(pairs) {
  return {
    duration: {
      ...computeDifferenceOutcome(pairs, (run) => run.durationMs, "durationMs"),
      ratio: computeRatioOutcome(pairs, (run) => run.durationMs, "durationMs"),
    },
    toolCalls: computeDifferenceOutcome(pairs, (run) => run.metrics?.toolCalls, "toolCalls"),
    llmTurns: computeDifferenceOutcome(pairs, (run) => run.metrics?.llmTurns, "llmTurns"),
    failedToolCalls: computeDifferenceOutcome(pairs, (run) => run.metrics?.failedToolCalls, "failedToolCalls"),
  };
}

export function computeIntegrity(runs, pairBuild) {
  const statusCounts = Object.fromEntries(["pending", "running", "completed", "failed", "timeout", "invalid"].map((status) => [status, runs.filter((run) => run.status === status).length]));
  const infrastructureInvalidRuns = runs.filter((run) => run.status === "invalid").length;
  const taskFailures = runs.filter((run) => run.status !== "invalid" && run.metrics?.taskSuccess === false).length;
  return {
    plannedRuns: 180,
    plannedPairs: 90,
    observedRuns: runs.length,
    observedPairIds: new Set(runs.map((run) => run.pairId).filter(Boolean)).size,
    validMatchedPairs: pairBuild.validPairs.length,
    invalidPairs: pairBuild.invalidPairs,
    statusCounts,
    completedValidRuns: runs.filter((run) => run.status === "completed").length,
    taskFailures,
    infrastructureInvalidRuns,
    missingRuns: Math.max(0, 180 - runs.length),
    missingRunCountRelativeToPlan: Math.max(0, 180 - runs.length),
    missingPairCountRelativeToPlan: Math.max(0, 90 - pairBuild.validPairs.length - pairBuild.invalidPairs.length),
  };
}

export function computeConfirmatoryAdjustment(h1, h2) {
  if (!Number.isFinite(h1?.test?.pValue) || !Number.isFinite(h2?.test?.pValue)) return { pending: true, reason: "Holm correction requires final H1 and H2 p-values" };
  return { pending: false, method: "Holm", familyWiseAlpha: 0.05, adjustedPValues: holmAdjust({ H1: h1.test.pValue, H2: h2.test.pValue }) };
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function runAnalysis(resultsDir, outputDir, annotationsPath = null) {
  await mkdir(outputDir, { recursive: true });
  const runs = await loadResults(resultsDir);
  const pairBuild = buildMatchedPairs(runs);
  const pairs = pairBuild.validPairs;
  const annotations = annotationsPath ? JSON.parse(await readFile(annotationsPath, "utf8")) : null;

  const h1 = computeH1(pairs);
  const h2 = computeH2(pairs, annotations);
  const h3 = computeH3(pairs);
  const h4 = computeH4(pairs, annotations);
  const secondary = computeSecondaryOutcomes(pairs);
  const confirmatory = computeConfirmatoryAdjustment(h1, h2);
  const integrity = computeIntegrity(runs, pairBuild);

  const summary = {
    experimentId: "phase5b-held-out",
    integrity,
    h1_taskSuccess: h1,
    h2_loopPersistence: h2,
    confirmatoryMultipleTesting: confirmatory,
    h3_tokenEfficiency: h3,
    h4_nonInterference: h4,
    secondary,
    bootstrap: { unit: "task", resamples: BOOTSTRAP_RESAMPLES, seed: BOOTSTRAP_SEED },
    signFlip: { unit: "task", monteCarloSamples: PERMUTATION_SAMPLES, seed: PERMUTATION_SEED, exactWhenTasksAtMost: 20 },
  };

  await writeFile(join(outputDir, "phase5b-analysis.json"), JSON.stringify(summary, null, 2) + "\n");

  let md = "# Phase 5B Analysis Report\n\n";
  md += "## Experiment Integrity\n";
  md += `- Planned runs: ${integrity.plannedRuns}\n- Completed valid runs: ${integrity.completedValidRuns}\n- Task failures: ${integrity.taskFailures}\n- Infrastructure-invalid runs: ${integrity.infrastructureInvalidRuns}\n- Missing runs: ${integrity.missingRuns}\n- Valid matched pairs: ${integrity.validMatchedPairs}\n- Infrastructure-invalid pairs: ${integrity.invalidPairs.length}\n\n`;
  md += "## H1: Task Success\n";
  md += `- Effect: ${h1.effectPercentagePoints === null ? "N/A" : h1.effectPercentagePoints.toFixed(2) + " pp"}\n`;
  md += `- Tasks: ${h1.nTasks}; matched replicates: ${h1.nMatchedReplicates}\n`;
  md += `- 95% task-clustered CI: [${h1.ci.ci95Lo ?? "N/A"}, ${h1.ci.ci95Hi ?? "N/A"}] (proportion scale)\n`;
  md += `- Two-sided sign-flip p: ${h1.test.pValue ?? "N/A"}\n\n`;
  md += "## H2: Persistent Semantic Loops\n";
  md += h2.pendingAnnotations ? `- Pending: ${h2.reason ?? "annotation incomplete"}\n\n` : `- Treatment-control incidence delta: ${h2.effect}\n- Reduction (positive favors ATHENA): ${h2.reduction}\n- 95% task-clustered CI for treatment-control delta: [${h2.ci.ci95Lo}, ${h2.ci.ci95Hi}]\n- Tasks: ${h2.nTasks}; matched replicates: ${h2.nMatchedReplicates}\n- Two-sided sign-flip p: ${h2.test.pValue}\n\n`;
  md += "## Confirmatory Multiple Testing\n";
  md += confirmatory.pending ? `- Pending: ${confirmatory.reason}\n\n` : `- Holm-adjusted H1 p: ${confirmatory.adjustedPValues.H1}\n- Holm-adjusted H2 p: ${confirmatory.adjustedPValues.H2}\n\n`;
  md += "## H3: Host Tokens\n";
  md += `- Geometric mean treatment/control ratio: ${h3.geometricMeanRatio ?? "N/A"}\n- Percent change: ${h3.percentChange ?? "N/A"}%\n- 95% CI ratio: ${h3.ci95Ratio ? `[${h3.ci95Ratio[0]}, ${h3.ci95Ratio[1]}]` : "N/A"}\n- 95% CI percent change: ${h3.ci95PercentChange ? `[${h3.ci95PercentChange[0]}%, ${h3.ci95PercentChange[1]}%]` : "N/A"}\n- Median raw paired token delta: ${h3.medianRawPairedDelta ?? "N/A"}\n- Tasks: ${h3.nTasks}; matched replicates: ${h3.nMatchedReplicates}\n- Missing/nonpositive pairs: ${h3.missing.length}\n\n`;
  md += "## H4: Non-Interference\n";
  md += `- Injected replans on legitimate-progress treatment runs: ${h4.totalInjected}\n- Unnecessary: ${h4.unnecessary}\n- Justified: ${h4.justified}\n- Uncertain/unlabeled: ${h4.uncertain + h4.unlabeled}\n- False-replan rate among adjudicated replans: ${h4.falseReplanRateAmongAdjudicated ?? "N/A"}\n- Unnecessary replans per legitimate-progress treatment run: ${h4.unnecessaryReplansPerTreatmentRun ?? "N/A"}\n`;
  await writeFile(join(outputDir, "phase5b-report.md"), md);

  const header = ["case_id", "h1_valid_replicates", "control_success_rate", "treatment_success_rate", "success_delta"];
  const rows = h1.tasks.map((task) => [task.caseId, task.validReplicates, task.controlSuccessRate, task.treatmentSuccessRate, task.delta].map(csvCell).join(","));
  await writeFile(join(outputDir, "phase5b-task-level.csv"), [header.join(","), ...rows].join("\n") + "\n");
  return summary;
}

const resultsDir = process.argv[2];
const outputDir = process.argv[3];
const annotationsPath = process.argv[4] ?? null;
if (resultsDir && outputDir && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const summary = await runAnalysis(resultsDir, outputDir, annotationsPath);
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
}
