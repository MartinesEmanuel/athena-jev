export type CandidateActionKind = "tool" | "answer" | "complete";

export interface CandidateAction {
  id: string;
  kind: CandidateActionKind;
  tool?: string;
  input?: string;
  intent: string;
  expectedObservation?: string;
  hypothesisId?: string;
}

export function isValidCandidateAction(
  value: unknown,
): value is CandidateAction {
  if (typeof value !== "object" || value === null || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  const obj = value as Record<string, unknown>;
  const fields = ["id", "kind", "tool", "input", "intent", "expectedObservation", "hypothesisId"];
  if (Object.keys(obj).some((key) => !fields.includes(key) || obj[key] === undefined)) return false;
  if (typeof obj.id !== "string" || obj.id.trim().length === 0) return false;
  if (!["tool", "answer", "complete"].includes(obj.kind as string))
    return false;
  if (typeof obj.intent !== "string" || obj.intent.trim().length === 0) return false;
  if (obj.tool !== undefined && (typeof obj.tool !== "string" || obj.tool.trim().length === 0)) return false;
  if (obj.input !== undefined && (typeof obj.input !== "string" || obj.input.trim().length === 0)) return false;
  if (
    obj.expectedObservation !== undefined &&
    (typeof obj.expectedObservation !== "string" || obj.expectedObservation.trim().length === 0)
  )
    return false;
  if (obj.hypothesisId !== undefined && (typeof obj.hypothesisId !== "string" || obj.hypothesisId.trim().length === 0))
    return false;
  return true;
}

export function assertCandidateAction(
  value: unknown,
): CandidateAction {
  if (!isValidCandidateAction(value)) {
    throw new TypeError("Invalid CandidateAction");
  }
  return value;
}
