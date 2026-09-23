export type ToolFamily = "INSPECT" | "SEARCH" | "EDIT" | "EXECUTE" | "WEB" | "EXTERNAL" | "OTHER";

export interface ToolDescriptor {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly family: ToolFamily;
  readonly tags?: readonly string[];
  readonly destructive?: boolean;
  readonly external?: boolean;
}

export interface ToolRoutingState {
  readonly goal: string;
  readonly currentIntent?: string;
  readonly recentObservationSummary?: string;
  readonly currentStrategy?: string;
  readonly unresolvedObligations?: readonly string[];
  readonly phase?: string;
  readonly availableFamilies: readonly ToolFamily[];
  readonly availableTools: readonly { id: string; family: ToolFamily; shortDescription?: string }[];
}

export type ToolRouterMode = "off" | "observe" | "active";
export type ToolRoutingReason = "JEV_ROUTED" | "UNCERTAIN" | "JEV_FAILURE" | "NO_SAVINGS" | "PROTECTED_CAPABILITY" | "DISABLED";
export interface ToolRoutingDecision {
  readonly mode: "ROUTED" | "FULL";
  readonly selectedToolIds: readonly string[];
  readonly selectedFamilies: readonly ToolFamily[];
  readonly reason: ToolRoutingReason;
  readonly stats: { readonly totalTools: number; readonly exposedTools: number; readonly hiddenTools: number; readonly toolReductionRatio: number };
}

/** Jev supplies independent semantic relevance probabilities; policy owns selection. */
export interface ToolRoutingJudge {
  judge(state: ToolRoutingState, families: readonly ToolFamily[]): Promise<Partial<Record<ToolFamily, number>>>;
}

export interface ToolRouterMetrics {
  readonly routerCalls: number;
  readonly routerFailures: number;
  readonly fullFallbacks: number;
  readonly totalToolsSeen: number;
  readonly totalToolsExposed: number;
  readonly totalToolsHidden: number;
  readonly routingLatencyMs: number;
  readonly jevRoutingLatencyMs: number;
  readonly decisions: number;
}
