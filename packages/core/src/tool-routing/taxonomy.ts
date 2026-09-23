import type { ToolFamily } from "./types.js";

export const toolFamilies: readonly ToolFamily[] = ["INSPECT", "SEARCH", "EDIT", "EXECUTE", "WEB", "EXTERNAL", "OTHER"];

/** Deliberately generic task hints. Host adapters map concrete tools. */
export function taskProtectedFamilies(text: string): readonly ToolFamily[] {
  const value = text.toLowerCase();
  const result = new Set<ToolFamily>();
  if (/\b(find|where|locate|inspect|read|understand|middleware|validat)/.test(value)) { result.add("INSPECT"); result.add("SEARCH"); }
  if (/\b(change|fix|edit|write|update|replace|implement|typo)/.test(value)) { result.add("INSPECT"); result.add("EDIT"); }
  if (/\b(test|tests|failing|failure|verify|build|lint|run)\b/.test(value)) { result.add("INSPECT"); result.add("EXECUTE"); }
  if (/\b(current|documentation|docs|look up|research|online|web)\b/.test(value)) result.add("WEB");
  if (/\b(mcp|integration|provider|external)\b/.test(value)) result.add("EXTERNAL");
  return [...result];
}
