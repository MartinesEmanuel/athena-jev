// Phase 5B blind annotation exporter. Keep identity mapping outside rater packet.
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { repetitionWindows, FROZEN_REPETITION_WINDOW_SIZE } from "./baselines/repetition-detector.mjs";

const CONTROL_TERMS = /ATHENA|METIS|REPLAN|NIKE|AEGIS|TYPE\s*SAFE/gi;
const ARM_TERMS = /\b(?:treatment|control)\b/gi;
const IDENTITY = /\b(?:session|message|tool[ -]?call|run)[ _-]?[a-z0-9-]{6,}\b|\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi;
const PATH = /(?:[A-Za-z]:)?(?:\/[\w.@-]+){2,}/g;

export const LOOP_LABELS = new Set(["LOOP", "PROGRESS", "UNCERTAIN"]);

function sanitizedText(value) {
  if (typeof value !== "string") return undefined;
  return value.replace(PATH, "[REDACTED]").replace(CONTROL_TERMS, "[REDACTED]").replace(ARM_TERMS, "[REDACTED]").replace(IDENTITY, "[REDACTED]") || undefined;
}

function isAthenaRecord(record) {
  return record.source === "athena" || record.type === "athena-event";
}

export function sanitizeTrace(rawTrace) {
  return rawTrace.filter((record) => !isAthenaRecord(record)).map((record, sequence) => ({
    sequence,
    type: record.type,
    tool: sanitizedText(record.tool),
    category: record.category || undefined,
    action: sanitizedText(record.input),
    outcome: sanitizedText(record.error ?? record.result),
    result: record.success === true ? "success" : record.success === false ? "failure" : undefined,
    text: sanitizedText(record.text ?? record.summary),
  }));
}

function actionWindow(trace, endIndex) {
  const actions = trace.filter((record) => record.type === "action");
  return actions.slice(Math.max(0, endIndex - FROZEN_REPETITION_WINDOW_SIZE + 1), endIndex + 1);
}

function replanWindows(rawTrace) {
  const hostActions = rawTrace.filter((record) => !isAthenaRecord(record) && record.type === "action");
  return rawTrace.flatMap((record) => {
    const event = record.event;
    if (!isAthenaRecord(record) || event?.type !== "REPLAN_CONTEXT_APPLIED") return [];
    const endIndex = hostActions.filter((action) => action.timestamp <= record.timestamp).length - 1;
    return [{ actions: actionWindow(hostActions, endIndex) }];
  }).filter((window) => window.actions.length);
}

export async function createBlindAnnotationPacket(resultsDir, outputDir) {
  await mkdir(outputDir, { recursive: true });
  const traceFiles = (await readdir(join(resultsDir, "raw"))).filter((file) => file.endsWith(".jsonl")).sort();
  const packet = [];
  const key = [];
  for (const traceFile of traceFiles) {
    const raw = await readFile(join(resultsDir, "raw", traceFile), "utf8");
    const records = raw.split("\n").filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
    const sanitized = sanitizeTrace(records);
    for (const window of repetitionWindows(records)) {
      const id = `A${String(packet.length + 1).padStart(4, "0")}`;
      packet.push({ annotationId: id, question: "Is agent persistently repeating same underlying strategy without enough new information?", traceWindow: actionWindow(sanitized, window.endIndex) });
      key.push({ annotationId: id, kind: "loop", runId: traceFile.slice(0, -6) });
    }
    for (const window of replanWindows(records)) {
      const id = `A${String(packet.length + 1).padStart(4, "0")}`;
      packet.push({ annotationId: id, question: "Is agent persistently repeating same underlying strategy without enough new information?", traceWindow: sanitizeTrace(window.actions) });
      key.push({ annotationId: id, kind: "replan", runId: traceFile.slice(0, -6) });
    }
  }
  await writeFile(join(outputDir, "annotation-packet.json"), `${JSON.stringify(packet, null, 2)}\n`);
  await writeFile(join(outputDir, "annotation-key.json"), `${JSON.stringify(key, null, 2)}\n`);
  return { packet, key };
}

function agreementRows(rows) {
  const byId = new Map();
  for (const row of rows) {
    if (!row?.annotationId || !row?.raterId || typeof row.label !== "string") throw new Error("Annotation requires annotationId, raterId, and label");
    if (!LOOP_LABELS.has(row.label)) throw new Error(`Invalid blind label: ${row.label}`);
    const ratings = byId.get(row.annotationId) ?? new Map();
    if (ratings.has(row.raterId)) throw new Error(`Duplicate rating for ${row.annotationId}`);
    ratings.set(row.raterId, row.label); byId.set(row.annotationId, ratings);
  }
  return byId;
}

export function cohenKappa(rows, raterIds) {
  const byId = agreementRows(rows);
  const raters = raterIds ?? [...new Set(rows.map((row) => row.raterId))].sort();
  if (raters.length !== 2) throw new Error("Cohen kappa requires exactly two raters");
  const paired = [...byId.values()].flatMap((ratings) => ratings.has(raters[0]) && ratings.has(raters[1]) ? [[ratings.get(raters[0]), ratings.get(raters[1])]] : []);
  if (!paired.length) return { raters, n: 0, observedAgreement: null, expectedAgreement: null, kappa: null };
  const labels = new Set(paired.flat());
  const observedAgreement = paired.filter(([left, right]) => left === right).length / paired.length;
  const proportion = (rater, label) => paired.filter((pair) => pair[rater] === label).length / paired.length;
  const expectedAgreement = [...labels].reduce((sum, label) => sum + proportion(0, label) * proportion(1, label), 0);
  return { raters, n: paired.length, observedAgreement, expectedAgreement, kappa: expectedAgreement === 1 ? (observedAgreement === 1 ? 1 : null) : (observedAgreement - expectedAgreement) / (1 - expectedAgreement) };
}

/** Load blinded adjudications and resolve opaque IDs only through separate key. */
export async function loadAdjudicatedAnnotations(annotationPath, keyPath) {
  const input = JSON.parse(await readFile(annotationPath, "utf8"));
  const key = JSON.parse(await readFile(keyPath, "utf8"));
  const rows = Array.isArray(input) ? input : input.annotations;
  const adjudications = Array.isArray(input) ? [] : input.adjudications;
  if (!Array.isArray(rows) || !Array.isArray(adjudications)) throw new Error("Annotation file requires annotations and adjudications arrays");
  const keyById = new Map(key.map((row) => [row.annotationId, row]));
  const agreement = cohenKappa(rows);
  const loopWindows = [], replanWindows = [];
  for (const row of adjudications) {
    const entry = keyById.get(row.annotationId);
    if (!entry || typeof row.label !== "string") throw new Error("Unknown annotation ID or missing adjudicated label");
    if (!LOOP_LABELS.has(row.label)) throw new Error(`Invalid blind label: ${row.label}`);
    const target = entry.kind === "loop" ? loopWindows : replanWindows;
    target.push({ runId: entry.runId, label: row.label });
  }
  return { loopWindows, replanWindows, agreement, singleAnnotator: new Set(rows.map((row) => row.raterId)).size === 1 };
}
