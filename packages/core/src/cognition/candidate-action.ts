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
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.id !== "string") return false;
  if (!["tool", "answer", "complete"].includes(obj.kind as string))
    return false;
  if (typeof obj.intent !== "string") return false;
  if (obj.tool !== undefined && typeof obj.tool !== "string") return false;
  if (obj.input !== undefined && typeof obj.input !== "string") return false;
  if (
    obj.expectedObservation !== undefined &&
    typeof obj.expectedObservation !== "string"
  )
    return false;
  if (obj.hypothesisId !== undefined && typeof obj.hypothesisId !== "string")
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
