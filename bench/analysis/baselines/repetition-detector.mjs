// Phase 5B frozen, deterministic baseline. Do not tune after labels/results exist.
export const FROZEN_REPETITION_WINDOW_SIZE = 5;
export const FROZEN_REPETITION_SIMILARITY_THRESHOLD = 0.8;

function normalizedAction(action) {
  return String(action.input ?? action.action ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

/** Returns fixed-size action-index windows in trace order. */
export function repetitionWindows(trace) {
  const actions = trace.filter((record) => record.type === "action");
  const windows = [];
  for (let endIndex = FROZEN_REPETITION_WINDOW_SIZE - 1; endIndex < actions.length; endIndex++) {
    const startIndex = endIndex - FROZEN_REPETITION_WINDOW_SIZE + 1;
    const actionsInWindow = actions.slice(startIndex, endIndex + 1);
    const toolFamily = actionsInWindow[0].category || "other";
    if (!actionsInWindow.every((action) => (action.category || "other") === toolFamily)) continue;

    const inputs = actionsInWindow.map(normalizedAction);
    const similarity = 1 - new Set(inputs).size / inputs.length;
    if (similarity < FROZEN_REPETITION_SIMILARITY_THRESHOLD) continue;
    if (actionsInWindow.some((action) => action.success === true)) continue;
    if (!actionsInWindow.some((action) => action.success === false)) continue;

    windows.push({ startIndex, endIndex, toolFamily, repetitionCount: inputs.length, similarity, label: "LOOP" });
  }
  return windows;
}

export function detectLoops(trace) {
  return repetitionWindows(trace);
}

export function evaluateDetector(traces, labels) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const trace of traces) {
    const detected = detectLoops(trace).length > 0;
    const labeled = labels.get(trace.id) === "LOOP";
    if (detected && labeled) tp++;
    else if (detected && !labeled) fp++;
    else if (!detected && labeled) fn++;
    else tn++;
  }
  const precision = tp / Math.max(1, tp + fp);
  const recall = tp / Math.max(1, tp + fn);
  const f1 = 2 * (precision * recall) / Math.max(0.001, precision + recall);
  const fpr = fp / Math.max(1, fp + tn);
  return { tp, fp, fn, tn, precision, recall, f1, fpr };
}
