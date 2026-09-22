import { join } from "node:path";
import { EventStore, createSession, decide, isMeaningful, loadConfig, stagnationEligible, stateFor, type Action, type AthenaConfig, type ReflexKind, type ReflexProvider, type Session, type ToolResult } from "@athena/core";
import { DemoReflexProvider } from "@athena/typesafe";

function actionFrom(tool: string, args: unknown): Action { return { id: crypto.randomUUID(), tool, input: JSON.stringify(args), readOnly: ["read", "glob", "grep", "list"].includes(tool), timestamp: new Date().toISOString() }; }
export function extractOutput(result: { content?: string | ReadonlyArray<{ type: string; text?: string }> }): string { if (typeof result.content === "string") return result.content; if (Array.isArray(result.content)) return result.content.filter((part): part is { type: "text"; text: string } => part.type === "text").map((part) => part.text).join("\n"); return ""; }

/**
 * Legacy V1-era reflex bridge.
 *
 * Kept for backwards compatibility and its event-log side effects. Its
 * `pendingActions` are never populated by the V2 host adapter, so it never
 * drives V2 cognition: the V2 runtime owns all Jev calls. Do not add cognitive
 * decisions here — that would duplicate System-1/System-2 logic.
 */
export class OpenCodeBridge {
  readonly session: Session;
  private lastLatencies: number[] = [];
  jevFailures = 0;
  constructor(private readonly root: string, goal = "OpenCode session", readonly provider: ReflexProvider = new DemoReflexProvider()) { this.session = createSession(goal); }
  get medianLatency(): number { if (!this.lastLatencies.length) return 0; const sorted = [...this.lastLatencies].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; }
  get providerHealthy(): boolean { return this.jevFailures === 0 || this.jevFailures / Math.max(1, this.session.jevCalls) < 0.5; }
  private async evaluate<T>(config: AthenaConfig, store: EventStore, kind: ReflexKind, run: () => Promise<T>): Promise<T | undefined> {
    if (this.session.jevCalls >= config.budgets.maxJevCallsPerSession) { await store.append({ timestamp: new Date().toISOString(), sessionId: this.session.id, type: "BUDGET_EXHAUSTED", metadata: { mode: config.mode, provider: this.provider.name, reflex: kind } }); return undefined; }
    const started = performance.now();
    await store.append({ timestamp: new Date().toISOString(), sessionId: this.session.id, type: "REFLEX_STARTED", metadata: { mode: config.mode, provider: this.provider.name, reflex: kind } });
    try {
      const value = await run();
      this.session.jevCalls++;
      const latencyMs = Math.round(performance.now() - started);
      this.lastLatencies.push(latencyMs);
      if (this.lastLatencies.length > 50) this.lastLatencies = this.lastLatencies.slice(-50);
      await store.append({ timestamp: new Date().toISOString(), sessionId: this.session.id, type: "REFLEX_COMPLETED", metadata: { mode: config.mode, provider: this.provider.name, reflex: kind, latencyMs, scores: value } });
      return value;
    } catch (error: unknown) {
      this.jevFailures++;
      await store.append({ timestamp: new Date().toISOString(), sessionId: this.session.id, type: "REFLEX_FAILED", metadata: { mode: config.mode, provider: this.provider.name, reflex: kind, latencyMs: Math.round(performance.now() - started), error: error instanceof Error ? error.message : "unknown provider failure" } });
      return undefined;
    }
  }
  async before(tool: string, args: unknown) { const config = await loadConfig(this.root); const action = actionFrom(tool, args); this.session.actions.push(action); if (isMeaningful(action)) this.session.meaningfulActions++; const store = new EventStore(join(this.root, ".athena", "events.jsonl"), config.telemetry.persist); await store.append({ timestamp: action.timestamp, sessionId: this.session.id, type: "ACTION_PROPOSED", metadata: { mode: config.mode, provider: this.provider.name, tool, args } }); const risk = !action.readOnly && config.reflexes.risk ? await this.evaluate(config, store, "risk", () => this.provider.evaluateRisk(stateFor(this.session, action))) : undefined; const policy = decide(config, { action, risk }); await store.append({ timestamp: new Date().toISOString(), sessionId: this.session.id, type: policy.decision === "deny" ? "ACTION_DENIED" : policy.decision === "ask" ? "ACTION_ASKED" : "ACTION_ALLOWED", metadata: { mode: config.mode, provider: this.provider.name, ...policy, risk, intervened: !policy.shadow && policy.decision !== "allow" } }); return { action, policy, risk }; }
  async after(action: Action, success: boolean, output: string, changedFiles: string[] = []) { const config = await loadConfig(this.root); const result: ToolResult = { actionId: action.id, success, output, changedFiles, timestamp: new Date().toISOString() }; this.session.results.push(result); const store = new EventStore(join(this.root, ".athena", "events.jsonl"), config.telemetry.persist); await store.append({ timestamp: result.timestamp, sessionId: this.session.id, type: success ? "TOOL_COMPLETED" : "TOOL_FAILED", metadata: { mode: config.mode, provider: this.provider.name, tool: action.tool } }); const state = stateFor(this.session, action, result); const progress = config.reflexes.progress && isMeaningful(action) ? await this.evaluate(config, store, "progress", () => this.provider.evaluateProgress(state)) : undefined; const stagnation = config.reflexes.stagnation && stagnationEligible(this.session, config) ? await this.evaluate(config, store, "stagnation", () => this.provider.evaluateStagnation(state)) : undefined; const policy = decide(config, { action, stagnation }); if (policy.decision === "replan" || policy.shadow) { this.session.replans++; this.session.lastReplanAt = Date.now(); this.session.lastReplanMeaningfulAction = this.session.meaningfulActions; await store.append({ timestamp: new Date().toISOString(), sessionId: this.session.id, type: "REPLAN_REQUESTED", metadata: { mode: config.mode, provider: this.provider.name, ...policy, stagnation, intervened: !policy.shadow } }); } return { progress, stagnation, policy }; }
}
