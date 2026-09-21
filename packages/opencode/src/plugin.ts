import { join } from "node:path";
import { Plugin } from "@opencode/plugin";
import { EventStore, createSession, decide, isMeaningful, loadConfig, saveConfig, stagnationEligible, stateFor, stagnationScore, type Action, type AthenaConfig, type PendingReplan, type ReflexKind, type ReflexProvider, type ReplanState, type Session, type StagnationReflex, type ToolResult } from "@athena/core";
import { DemoReflexProvider } from "@athena/typesafe";
import { athenaRpc } from "./rpc.js";
import { createTypeSafeSystem1 } from "@athena/typesafe";
import { CognitiveRuntime } from "./cognitive-runtime.js";

function actionFrom(tool: string, args: unknown): Action { return { id: crypto.randomUUID(), tool, input: JSON.stringify(args), readOnly: ["read", "glob", "grep", "list"].includes(tool), timestamp: new Date().toISOString() }; }
function extractOutput(result: { content?: string | ReadonlyArray<{ type: string; text?: string }> }): string { if (typeof result.content === "string") return result.content; if (Array.isArray(result.content)) return result.content.filter((part): part is { type: "text"; text: string } => part.type === "text").map((part) => part.text).join("\n"); return ""; }
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

export const AthenaPlugin = Plugin.define({
  id: "athena",
  async setup(ctx) {
    const directory = ctx.location.directory;
    let config = await loadConfig(directory);
    // Legacy RPC remains available, but production V2 cognition owns all Jev calls.
    const bridge = new OpenCodeBridge(directory, "OpenCode session", new DemoReflexProvider());
    const cognitive = new CognitiveRuntime(createTypeSafeSystem1());
    const pendingActions = new Map<string, Action>();
    const pendingReplans = new Map<string, PendingReplan>();
    const recentEvents: Array<{ type: string; timestamp: string; metadata?: Record<string, unknown> }> = [];
    const MAX_RECENT = 50;
    const store = new EventStore(join(directory, ".athena", "events.jsonl"), config.telemetry.persist);

    function pushRecent(type: string, metadata?: Record<string, unknown>) {
      recentEvents.push({ type, timestamp: new Date().toISOString(), metadata });
      if (recentEvents.length > MAX_RECENT) recentEvents.splice(0, recentEvents.length - MAX_RECENT);
    }

    function updateReplanState(replan: PendingReplan, state: ReplanState) {
      replan.state = state;
    }

    // Register RPC
    const rpcReg = await ctx.rpc.register(athenaRpc, {
      status: async () => ({
        mode: config.mode,
        provider: bridge.provider.name,
        providerHealthy: bridge.providerHealthy,
        jevCalls: bridge.session.jevCalls,
        jevFailures: bridge.jevFailures,
        medianLatency: bridge.medianLatency,
        budgetUsed: bridge.session.jevCalls,
        budgetLimit: config.budgets.maxJevCallsPerSession,
      }),
      session: async (input) => {
        const { sessionID } = input as { sessionID: string };
        const pending = pendingReplans.get(sessionID);
        const lastReplan = [...pendingReplans.values()].filter((r) => r.sessionID === sessionID).at(-1);
        return {
          sessionID,
          lastRisk: null,
          lastStagnation: null,
          lastCompletion: null,
          pendingReplan: pending && !pending.consumed ? { id: pending.id, state: pending.state, stagnationScore: pending.stagnationScore } : null,
          lastReplan: lastReplan ? { id: lastReplan.id, state: lastReplan.state, outcome: lastReplan.outcome, createdAt: lastReplan.createdAt } : null,
          reflexCount: recentEvents.filter((e) => e.type === "REFLEX_COMPLETED").length,
          jevCallCount: bridge.session.jevCalls,
          budgetUsed: bridge.session.jevCalls,
          budgetLimit: config.budgets.maxJevCallsPerSession,
        };
      },
      setMode: async (input) => {
        const { mode: newMode } = input as { mode: AthenaConfig["mode"] };
        config = { ...config, mode: newMode };
        await saveConfig(directory, config);
        await store.append({ timestamp: new Date().toISOString(), sessionId: bridge.session.id, type: "MODE_CHANGED", metadata: { mode: newMode } });
        await rpcReg.events.emit("modeChanged", { mode: newMode });
        pushRecent("MODE_CHANGED", { mode: newMode });
        return { mode: newMode };
      },
      recentEvents: async (input) => {
        const { sessionID, limit: rawLimit } = input as { sessionID?: string; limit?: number };
        const limit = rawLimit ?? 20;
        const filtered = sessionID ? recentEvents.filter((e) => e.metadata?.sessionID === sessionID || !e.metadata?.sessionID) : recentEvents;
        return { events: filtered.slice(-limit) };
      },
    });

    // Tool hooks
    const toolBefore = await ctx.tool.hook("execute.before", async (input) => {
      await cognitive.before(input.sessionID, input.id, input.tool, input.input);
    });

    const toolAfter = await ctx.tool.hook("execute.after", async (input) => {
      cognitive.after(input.sessionID, input.id, input.tool, input.status, input.status === "completed" ? input.result : input.error);
      const action = pendingActions.get(input.id);
      pendingActions.delete(input.id);
      if (!action || input.status === "error") return;
      const output = extractOutput(input.result);
      const judged = await bridge.after(action, true, output);

      // Emit reflex event for TUI
      if (judged.stagnation) {
        await rpcReg.events.emit("reflex", {
          sessionID: input.sessionID,
          reflex: "stagnation",
          decision: judged.policy.decision,
          scores: judged.stagnation,
          latencyMs: 0,
        });
        pushRecent("REFLEX_COMPLETED", { reflex: "stagnation", decision: judged.policy.decision, scores: judged.stagnation });
      }

      // Track post-replan actions — any tool execution after replan injection
      const activeReplan = [...pendingReplans.values()].find((r) => r.sessionID === input.sessionID && (r.state === "injected" || r.consumed));
      if (activeReplan) {
        pushRecent("POST_REPLAN_ACTION", { replanId: activeReplan.id, tool: action.tool });
      }

      // Create pending replan on REPLAN decision
      if (judged.stagnation && judged.policy.decision === "replan") {
        const replan: PendingReplan = {
          id: `replan_${crypto.randomUUID().slice(0, 12)}`,
          sessionID: input.sessionID,
          createdAt: Date.now(),
          stagnationScore: stagnationScore(judged.stagnation),
          evidence: judged.stagnation as StagnationReflex,
          consumed: false,
          state: "detected",
        };
        updateReplanState(replan, "queued");
        pendingReplans.set(input.sessionID, replan);
        await rpcReg.events.emit("replanQueued", {
          replanId: replan.id,
          sessionID: replan.sessionID,
          stagnationScore: replan.stagnationScore,
        });
        await store.append({
          timestamp: new Date().toISOString(),
          sessionId: bridge.session.id,
          type: "REPLAN_QUEUED",
          metadata: {
            mode: config.mode,
            provider: bridge.provider.name,
            replanId: replan.id,
            sessionID: replan.sessionID,
            stagnationScore: replan.stagnationScore,
            evidence: replan.evidence,
          },
        });
        pushRecent("REPLAN_QUEUED", { replanId: replan.id, stagnationScore: replan.stagnationScore });
      }
    });

    const promptHook = await ctx.session.hook("prompt", async (event) => {
      cognitive.capturePrompt(event.sessionID, event.prompt);
    });

    // Context hook — inject only queued privileged cognitive context.
    const contextHook = await ctx.session.hook("context", async (event) => {
      const cognitiveContext = cognitive.injectContext(event.sessionID);
      if (cognitiveContext) event.system.push({ type: "text", text: cognitiveContext });
    });

    return () => {
      void toolBefore.dispose();
      void toolAfter.dispose();
      void promptHook.dispose();
      void contextHook.dispose();
      void rpcReg.dispose();
      pendingActions.clear();
      pendingReplans.clear();
    };
  },
});
