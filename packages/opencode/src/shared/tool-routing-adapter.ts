import { buildToolRoutingState, type ToolDescriptor, type ToolFamily, type ToolRoutingState } from "@athena/core";

type OpenCodeTool = { description?: string; input?: unknown };

function familyOf(id: string, description: string): ToolFamily {
  const value = `${id} ${description}`.toLowerCase();
  if (/\b(read|list|ls|symbol|inspect|file)\b/.test(value)) return "INSPECT";
  if (/\b(grep|glob|search|find|rg)\b/.test(value)) return "SEARCH";
  if (/\b(edit|write|patch|replace|apply)\b/.test(value)) return "EDIT";
  if (/\b(bash|shell|terminal|command|test|task|exec|run)\b/.test(value)) return "EXECUTE";
  if (/\b(web|fetch|browser|internet|http)\b/.test(value)) return "WEB";
  if (/\b(mcp|external|integration|provider)\b/.test(value)) return "EXTERNAL";
  return "OTHER";
}

export function describeOpenCodeTools(tools: Record<string, OpenCodeTool>): ToolDescriptor[] {
  return Object.entries(tools).map(([id, tool]) => {
    const description = typeof tool.description === "string" ? tool.description : undefined;
    const family = familyOf(id, description ?? "");
    return { id, name: id, ...(description ? { description } : {}), family, external: family === "EXTERNAL" || id.includes("_") && /mcp|external/i.test(id) };
  });
}

export function openCodeRoutingState(input: Omit<ToolRoutingState, "availableFamilies" | "availableTools">, tools: Record<string, OpenCodeTool>): ToolRoutingState {
  return buildToolRoutingState({ ...input, tools: describeOpenCodeTools(tools) });
}

/** Copy only selected keys; never mutate host definitions or schemas. */
export function selectOpenCodeTools<T>(tools: Record<string, T>, ids: readonly string[]): Record<string, T> {
  const selected = new Set(ids);
  return Object.fromEntries(Object.entries(tools).filter(([id]) => selected.has(id)));
}
