export type AgentActionCategory = "shell" | "read" | "write" | "edit" | "delete" | "search" | "network" | "mcp" | "subagent" | "other";
export type AthenaControlSignal = "ALLOW" | "ASK" | "DENY" | "REPLAN";

export interface AgentCapabilities {
  beforeAction: boolean;
  afterAction: boolean;
  denyAction: boolean;
  modifyAction: boolean;
  privilegedContextInjection: boolean;
  completionObservation: boolean;
  completionControl: boolean;
  compactionObservation: boolean;
  nativeUI: boolean;
}

export interface AgentAction {
  id: string;
  sessionId: string;
  runtime: string;
  model?: string;
  tool: string;
  category: AgentActionCategory;
  input: unknown;
  cwd?: string;
  timestamp: string;
  native: Record<string, unknown>;
}

export interface AgentActionResult {
  actionId: string;
  sessionId: string;
  success: boolean;
  exitCode?: number;
  result: unknown;
  error?: string;
  durationMs?: number;
  changedFiles?: string[];
  timestamp: string;
  native: Record<string, unknown>;
}

export interface AthenaAgentAdapter<BeforeInput = unknown, AfterInput = unknown, Output = unknown> {
  readonly id: string;
  readonly runtime: string;
  readonly capabilities: AgentCapabilities;
  normalizeBeforeAction(input: BeforeInput): AgentAction;
  normalizeAfterAction(input: AfterInput): AgentActionResult;
  encodeControl(signal: AthenaControlSignal, reason?: string, context?: string): Output;
}
