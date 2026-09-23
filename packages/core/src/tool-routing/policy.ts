import { taskProtectedFamilies } from "./taxonomy.js";
import type { ToolDescriptor, ToolFamily, ToolRoutingDecision, ToolRoutingReason, ToolRoutingState } from "./types.js";

function decision(tools: readonly ToolDescriptor[], ids: readonly string[], reason: ToolRoutingReason, mode: "ROUTED" | "FULL"): ToolRoutingDecision {
  const selected = [...new Set(ids)].filter((id) => tools.some((tool) => tool.id === id));
  const exposed = mode === "FULL" ? tools.length : selected.length;
  const finalIds = mode === "FULL" ? tools.map((tool) => tool.id) : selected;
  return { mode, selectedToolIds: finalIds, selectedFamilies: [...new Set(tools.filter((tool) => finalIds.includes(tool.id)).map((tool) => tool.family))], reason, stats: { totalTools: tools.length, exposedTools: exposed, hiddenTools: tools.length - exposed, toolReductionRatio: tools.length === 0 ? 0 : 1 - exposed / tools.length } };
}

export function fullToolRoutingDecision(tools: readonly ToolDescriptor[], reason: ToolRoutingReason): ToolRoutingDecision { return decision(tools, [], reason, "FULL"); }

/** Conservative deterministic policy: uncertain/unknown capability access is retained. */
export function routeToolFamilies(state: ToolRoutingState, tools: readonly ToolDescriptor[], relevance: Partial<Record<ToolFamily, number>>): ToolRoutingDecision {
  if (tools.length <= 2) return fullToolRoutingDecision(tools, "NO_SAVINGS");
  const families = new Set<ToolFamily>();
  for (const family of state.availableFamilies) {
    const score = relevance[family];
    if (score === undefined || !Number.isFinite(score) || score < 0 || score > 1) return fullToolRoutingDecision(tools, "UNCERTAIN");
    // 0.5 is uncertain, never "medium" relevance. Keep a wide uncertainty band.
    if (score >= 0.35) families.add(family);
  }
  for (const family of taskProtectedFamilies([state.goal, state.currentIntent, ...(state.unresolvedObligations ?? [])].filter(Boolean).join(" "))) families.add(family);
  if (families.has("EDIT")) families.add("INSPECT");
  if (state.phase === "VERIFY" || (state.unresolvedObligations ?? []).some((item) => /test|verify|build|lint/i.test(item))) families.add("EXECUTE");
  // Unknown and external/custom integrations have insufficient semantics to prune safely.
  for (const tool of tools) if (tool.family === "OTHER" || tool.external) families.add(tool.family);
  const selected = tools.filter((tool) => families.has(tool.family)).map((tool) => tool.id);
  if (selected.length === 0 || selected.length === tools.length) return fullToolRoutingDecision(tools, selected.length === 0 ? "PROTECTED_CAPABILITY" : "NO_SAVINGS");
  return decision(tools, selected, "JEV_ROUTED", "ROUTED");
}
