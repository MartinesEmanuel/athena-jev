import { normalizeText } from "../index.js";
import type { ToolDescriptor, ToolRoutingState } from "./types.js";

const limit = (value: string | undefined, length: number) => value ? normalizeText(value, length) : undefined;

/** Bounded redacted state; descriptors deliberately omit schemas and arguments. */
export function buildToolRoutingState(input: Omit<ToolRoutingState, "availableFamilies" | "availableTools"> & { readonly tools: readonly ToolDescriptor[] }): ToolRoutingState {
  return Object.freeze({
    goal: normalizeText(input.goal, 700), currentIntent: limit(input.currentIntent, 280), recentObservationSummary: limit(input.recentObservationSummary, 360), currentStrategy: limit(input.currentStrategy, 220),
    unresolvedObligations: input.unresolvedObligations?.slice(0, 6).map((item) => normalizeText(item, 160)), phase: input.phase,
    availableFamilies: [...new Set(input.tools.map((tool) => tool.family))],
    availableTools: input.tools.slice(0, 64).map((tool) => ({ id: normalizeText(tool.id, 80), family: tool.family, ...(tool.description ? { shortDescription: normalizeText(tool.description, 140) } : {}) })),
  });
}
