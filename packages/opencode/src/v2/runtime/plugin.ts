import { join } from "node:path";
import { Plugin } from "@opencode/plugin";
import { EventStore, ToolRouter, loadConfig, saveConfig, stagnationScore, type Action, type AthenaConfig, type PendingReplan, type ReplanState, type StagnationReflex } from "@athena/core";
import { createTypeSafeSystem1, DemoReflexProvider, TypeSafeToolRoutingJudge } from "@athena/typesafe";
import { parseAthenaUiSnapshot, type AthenaUiSnapshot } from "@athena/hud-protocol";
import { athenaRpc } from "../../shared/rpc.js";
import { CognitiveRuntime } from "../../shared/cognitive-runtime.js";
import { OpenCodeBridge, extractOutput } from "../../shared/bridge.js";
import { createHudSocketObserver } from "../../shared/hud-observer.js";
import { athenaSessionRef, type AthenaUiObserver } from "../../shared/ui-snapshot.js";
import { loadAthenaCredentials } from "../../shared/credentials.js";
import { athenaModeNotice, parseAthenaMode } from "../../shared/commands.js";
import { describeOpenCodeTools, openCodeRoutingState, selectOpenCodeTools } from "../../shared/tool-routing-adapter.js";

/** Bounded cache so a long-lived host cannot grow UI snapshots without limit. */
const MAX_CACHED_SNAPSHOTS = 32;

/**
 * OpenCode V2 host adapter.
 *
 * ATHENA CORE stays authoritative: this file only wires tool/session hooks to
 * the cognitive runtime and forwards already-redacted telemetry to observers.
 * It never executes tools and never lets UI/RPC failures reach cognition.
 */
export const AthenaPlugin = Plugin.define({
  id: "athena",
  async setup(ctx) {
    const directory = ctx.location.directory;
    // ATHENA owns its credentials: load from ATHENA-owned storage before any
    // provider client is constructed. OpenCode config never holds the key.
    loadAthenaCredentials();
    let config = await loadConfig(directory);
    // Legacy RPC remains available, but production V2 cognition owns all Jev calls.
    const bridge = new OpenCodeBridge(directory, "OpenCode session", new DemoReflexProvider());
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

    /** Single mode-change path shared by RPC and the `/athena-mode` command. */
    async function applyMode(newMode: AthenaConfig["mode"]): Promise<void> {
      config = { ...config, mode: newMode };
      await saveConfig(directory, config);
      await store.append({ timestamp: new Date().toISOString(), sessionId: bridge.session.id, type: "MODE_CHANGED", metadata: { mode: newMode } });
      await emitEvent("modeChanged", { mode: newMode });
      pushRecent("MODE_CHANGED", { mode: newMode });
    }

    // Sanitized UI snapshots: cache for the seed fetch, fan out over RPC.
    const uiSnapshots = new Map<string, AthenaUiSnapshot>();
    const routerStatuses = new Map<string, { visible: number; selected: number; total: number; mode: "ROUTED" | "FULL" | "OBSERVE" }>();
    let emitSnapshot: ((snapshot: AthenaUiSnapshot) => Promise<void>) | undefined;
    const uiObserver: AthenaUiObserver = {
      publish(value) {
        // Contract validation: anything off-contract never reaches the TUI.
        const priorRouter = routerStatuses.get(value.sessionRef);
        const snapshot = parseAthenaUiSnapshot(priorRouter ? { ...value, toolRouter: priorRouter } : value);
        if (uiSnapshots.size >= MAX_CACHED_SNAPSHOTS && !uiSnapshots.has(snapshot.sessionRef)) {
          const oldest = uiSnapshots.keys().next().value;
          if (oldest !== undefined) uiSnapshots.delete(oldest);
        }
        uiSnapshots.set(snapshot.sessionRef, snapshot);
        void emitSnapshot?.(snapshot).catch(() => undefined);
      },
    };

    const cognitive = new CognitiveRuntime(createTypeSafeSystem1(), undefined, createHudSocketObserver(), uiObserver, config.enforcementMode);
    // The official V2 `session.context` hook is immediately before primary model
    // inference and exposes a mutable tool map. Router errors are always swallowed.
    let toolRouter: ToolRouter | undefined;
    if (config.toolRouter.mode !== "off") {
      try {
        toolRouter = new ToolRouter(new TypeSafeToolRoutingJudge(), config.toolRouter.mode);
      } catch {
        // Credentials/provider setup is optional for this optimization. Existing
        // inference and cognitive control continue with the full tool set.
      }
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
        await applyMode(newMode);
        return { mode: newMode };
      },
      snapshot: async (input) => {
        const { sessionID } = input as { sessionID: string };
        return { snapshot: uiSnapshots.get(athenaSessionRef(sessionID)) ?? null };
      },
      recentEvents: async (input) => {
        const { sessionID, limit: rawLimit } = input as { sessionID?: string; limit?: number };
        const limit = rawLimit ?? 20;
        const filtered = sessionID ? recentEvents.filter((e) => e.metadata?.sessionID === sessionID || !e.metadata?.sessionID) : recentEvents;
        return { events: filtered.slice(-limit) };
      },
    });

    /** Emit failures are UI failures: swallow them so cognition and the host survive. */
    async function emitEvent(...args: Parameters<typeof rpcReg.events.emit>): Promise<void> {
      try {
        await rpcReg.events.emit(...args);
      } catch {
        // Telemetry fan-out must never break the host.
      }
    }
    emitSnapshot = async (snapshot) => { await emitEvent("snapshot", { snapshot }); };

    // Server-side slash commands (official `ctx.command.transform` API).
    // They surface in the prompt autocomplete and run through
    // `session.command`, so the TUI needs no keymap layer: `/athena` asks the
    // TUI to open the expanded panel over RPC, `/athena-mode` applies a
    // validated mode change and reports invalid input as an inline notice.
    const commandReg = await ctx.command.transform((editor) => {
      editor.add({
        name: "athena",
        description: "open the ATHENA cognitive panel",
        execute: async (input) => {
          await emitEvent("panelRequested", { sessionID: input.sessionID });
        },
      });
      editor.add({
        name: "athena-mode",
        description: "set ATHENA mode: shadow | guardian | balanced",
        execute: async (input) => {
          const raw = input.prompt?.text ?? "";
          const mode = parseAthenaMode(raw);
          if (!mode) {
            await emitEvent("commandNotice", { message: athenaModeNotice(raw) });
            return;
          }
          try {
            await applyMode(mode);
          } catch {
            await emitEvent("commandNotice", { message: "mode change unavailable (server unreachable)" });
          }
        },
      });
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
        await emitEvent("reflex", {
          sessionID: input.sessionID,
          reflex: "stagnation",
          decision: judged.policy.decision,
          scores: judged.stagnation as unknown as Record<string, unknown>,
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
        await emitEvent("replanQueued", {
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
      if (!toolRouter || event.tools === undefined) return;
      try {
        const hostTools = event.tools as Record<string, { description?: string; input?: unknown }>;
        const state = openCodeRoutingState(cognitive.routingContext(event.sessionID), hostTools);
        const decision = await toolRouter.route(state, describeOpenCodeTools(hostTools));
        routerStatuses.set(athenaSessionRef(event.sessionID), { visible: config.toolRouter.mode === "observe" ? decision.stats.totalTools : decision.stats.exposedTools, selected: decision.stats.exposedTools, total: decision.stats.totalTools, mode: config.toolRouter.mode === "observe" ? "OBSERVE" : decision.mode });
        // Observe retains the original tool map. Active removes only a policy-selected subset.
        if (config.toolRouter.mode === "active" && decision.mode === "ROUTED") event.tools = selectOpenCodeTools(event.tools, decision.selectedToolIds);
      } catch {
        // Fail open: leave the original host tool map untouched.
      }
    });

    return () => {
      void toolBefore.dispose();
      void toolAfter.dispose();
      void promptHook.dispose();
      void contextHook.dispose();
      void rpcReg.dispose();
      void commandReg.dispose();
      pendingActions.clear();
      pendingReplans.clear();
      uiSnapshots.clear();
      routerStatuses.clear();
      emitSnapshot = undefined;
    };
  },
});

export default AthenaPlugin;
