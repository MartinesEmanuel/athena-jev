import { createHash } from "node:crypto";
import { routeToolFamilies, fullToolRoutingDecision } from "./policy.js";
import type { ToolDescriptor, ToolRouterMetrics, ToolRouterMode, ToolRoutingDecision, ToolRoutingJudge, ToolRoutingState } from "./types.js";

const emptyMetrics = (): ToolRouterMetrics => ({ routerCalls: 0, routerFailures: 0, fullFallbacks: 0, totalToolsSeen: 0, totalToolsExposed: 0, totalToolsHidden: 0, routingLatencyMs: 0, jevRoutingLatencyMs: 0, decisions: 0 });

export class ToolRouter {
  private readonly cache = new Map<string, ToolRoutingDecision>();
  private values = emptyMetrics();
  constructor(private readonly judge: ToolRoutingJudge, private readonly mode: ToolRouterMode = "observe", private readonly cacheLimit = 32) {}
  metrics(): ToolRouterMetrics { return { ...this.values }; }
  async route(state: ToolRoutingState, tools: readonly ToolDescriptor[]): Promise<ToolRoutingDecision> {
    if (this.mode === "off") return this.record(fullToolRoutingDecision(tools, "DISABLED"), 0);
    if (tools.length <= 2) return this.record(fullToolRoutingDecision(tools, "NO_SAVINGS"), 0);
    const key = createHash("sha256").update(JSON.stringify({ goal: state.goal, intent: state.currentIntent, observation: state.recentObservationSummary, strategy: state.currentStrategy, phase: state.phase, obligations: state.unresolvedObligations, tools: tools.map((tool) => [tool.id, tool.family]) })).digest("hex");
    const cached = this.cache.get(key);
    if (cached) return this.record(cached, 0);
    const started = performance.now();
    this.values = { ...this.values, routerCalls: this.values.routerCalls + 1 };
    try {
      const relevance = await this.judge.judge(state, state.availableFamilies);
      const latency = Math.round(performance.now() - started);
      const result = routeToolFamilies(state, tools, relevance);
      if (this.cache.size >= this.cacheLimit) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, result);
      return this.record(result, latency);
    } catch {
      const result = fullToolRoutingDecision(tools, "JEV_FAILURE");
      this.values = { ...this.values, routerFailures: this.values.routerFailures + 1 };
      return this.record(result, Math.round(performance.now() - started));
    }
  }
  private record(result: ToolRoutingDecision, latency: number): ToolRoutingDecision {
    this.values = { ...this.values, decisions: this.values.decisions + 1, fullFallbacks: this.values.fullFallbacks + (result.mode === "FULL" ? 1 : 0), totalToolsSeen: this.values.totalToolsSeen + result.stats.totalTools, totalToolsExposed: this.values.totalToolsExposed + result.stats.exposedTools, totalToolsHidden: this.values.totalToolsHidden + result.stats.hiddenTools, routingLatencyMs: this.values.routingLatencyMs + latency, jevRoutingLatencyMs: this.values.jevRoutingLatencyMs + latency };
    return result;
  }
}
