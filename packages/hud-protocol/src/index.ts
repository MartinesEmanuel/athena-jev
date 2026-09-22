import { z } from "zod";

export const ATHENA_HUD_VERSION = 1 as const;

const secretPattern = /(?:\b(?:api[_-]?key|password|token|secret)\s*[=:]\s*\S+|\bBearer\s+\S+|\bsk-[\w-]{12,}|\bAKIA\w{16})/i;
// eslint-disable-next-line no-control-regex -- terminal control bytes must not reach HUD output.
const controlPattern = /[\u0000-\u001f\u007f]/g;
// eslint-disable-next-line no-control-regex -- validation must reject terminal control bytes.
const hasControlPattern = /[\u0000-\u001f\u007f]/;

export function redactHudText(value: string, limit = 160): string {
  return value.replace(controlPattern, " ").replace(secretPattern, "[REDACTED]").replace(/\s+/g, " ").trim().slice(0, limit);
}

const redactedText = (limit: number) => z.string().min(1).max(limit).refine((value) => !hasControlPattern.test(value) && !secretPattern.test(value), "HUD text must be redacted");
const identifier = z.string().min(1).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/).refine((value) => !secretPattern.test(value), "HUD identifier must not contain secrets");
const probability = z.number().finite().min(0).max(1);

export const hudStatusSchema = z.enum(["IDLE", "ASSESSING", "GO", "DELIBERATE", "VERIFY", "BLOCK", "SYSTEM2", "DEGRADED"]);
export const hudDecisionSchema = z.enum(["NONE", "ALLOW", "ASK", "DENY", "REPLAN"]);
export const hudAssessmentSchema = z.object({
  state: z.enum(["UNKNOWN", "CLEAR", "WATCH", "ALERT"]),
  confidence: probability,
}).strict();
export const hudEpistemicsSchema = z.object({
  state: z.enum(["UNKNOWN", "GROUNDED", "MIXED", "CONFLICTED"]),
  confidence: probability,
}).strict();
export const hudSystem2Schema = z.object({
  state: z.enum(["IDLE", "QUEUED", "RUNNING", "COMPLETE", "UNAVAILABLE"]),
  confidence: probability.optional(),
}).strict();
export const hudSessionSchema = z.object({
  actions: z.number().int().min(0).max(100_000),
  meaningfulActions: z.number().int().min(0).max(100_000),
  replans: z.number().int().min(0).max(10_000),
  system1Calls: z.number().int().min(0).max(100_000),
  system2Calls: z.number().int().min(0).max(100_000),
}).strict();
export const hudTimelineEventSchema = z.object({
  timestamp: z.number().int().nonnegative(),
  type: z.enum(["ASSESSMENT", "DECISION", "ACTION", "VERIFY", "SYSTEM2", "DEGRADED"]),
  status: hudStatusSchema,
  decision: hudDecisionSchema,
  reason: redactedText(96).optional(),
}).strict();
export const athenaHudSnapshotSchema = z.object({
  version: z.literal(ATHENA_HUD_VERSION),
  sessionId: identifier,
  timestamp: z.number().int().nonnegative(),
  status: hudStatusSchema,
  decision: hudDecisionSchema,
  reason: redactedText(160),
  system1: hudAssessmentSchema,
  aegis: hudAssessmentSchema,
  metis: hudAssessmentSchema,
  nike: hudAssessmentSchema,
  epistemics: hudEpistemicsSchema,
  system2: hudSystem2Schema,
  session: hudSessionSchema,
  timeline: z.array(hudTimelineEventSchema).max(12),
}).strict();

export type AthenaHudSnapshot = z.infer<typeof athenaHudSnapshotSchema>;
export type AthenaHudTimelineEvent = z.infer<typeof hudTimelineEventSchema>;

/** Non-blocking boundary for runtime telemetry. Transport belongs outside cognition. */
export interface AthenaHudObserver {
  publish(snapshot: AthenaHudSnapshot): void | Promise<void>;
}

export function parseAthenaHudSnapshot(value: unknown): AthenaHudSnapshot {
  return athenaHudSnapshotSchema.parse(value);
}

export function createAthenaHudSnapshot(value: Omit<AthenaHudSnapshot, "version">): AthenaHudSnapshot {
  return parseAthenaHudSnapshot({
    ...value,
    version: ATHENA_HUD_VERSION,
    reason: redactHudText(value.reason, 160),
    timeline: value.timeline.slice(-12).map((event) => ({ ...event, reason: event.reason === undefined ? undefined : redactHudText(event.reason, 96) })),
  });
}

// Labels are presentation-only. Snapshot values stay stable machine codes.
export const hudStatusLabel: Record<AthenaHudSnapshot["status"], string> = {
  IDLE: "Idle", ASSESSING: "Assessing", GO: "Go", DELIBERATE: "Deliberate", VERIFY: "Verify", BLOCK: "Blocked", SYSTEM2: "System 2", DEGRADED: "Degraded",
};
export const hudDecisionLabel: Record<AthenaHudSnapshot["decision"], string> = {
  NONE: "No decision", ALLOW: "Allow", ASK: "Ask", DENY: "Deny", REPLAN: "Replan",
};
export const hudAssessmentLabel: Record<z.infer<typeof hudAssessmentSchema>["state"], string> = {
  UNKNOWN: "Unknown", CLEAR: "Clear", WATCH: "Watch", ALERT: "Alert",
};
export const hudEpistemicsLabel: Record<z.infer<typeof hudEpistemicsSchema>["state"], string> = {
  UNKNOWN: "Unknown", GROUNDED: "Grounded", MIXED: "Mixed", CONFLICTED: "Conflicted",
};
export const hudSystem2Label: Record<z.infer<typeof hudSystem2Schema>["state"], string> = {
  IDLE: "Idle", QUEUED: "Queued", RUNNING: "Running", COMPLETE: "Complete", UNAVAILABLE: "Unavailable",
};
export const hudTimelineLabel: Record<AthenaHudTimelineEvent["type"], string> = {
  ASSESSMENT: "Assessment", DECISION: "Decision", ACTION: "Action", VERIFY: "Verify", SYSTEM2: "System 2", DEGRADED: "Degraded",
};
