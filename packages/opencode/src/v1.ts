import { createHash } from "node:crypto";
import { join } from "node:path";
import type { Plugin as V1Plugin } from "@opencode-ai/plugin-v1";
import { EventStore, isMeaningful, loadConfig, stagnationScore, strategyFamily, type Action, type PendingReplan, type ReflexProvider } from "@athena/core";
import { DemoReflexProvider, TypeSafeReflexProvider } from "@athena/typesafe";
import { OpenCodeBridge } from "./plugin.js";

const CONTROL = "ATHENA CONTROL\n\nThe current strategy is semantically stagnant.\nStop retrying superficial variations of the same approach.\nUse the evidence already gathered to reassess the unresolved root cause.\nChoose a materially different strategy before the next meaningful action.";
const STALE_MS = 30 * 60 * 1000;
const providerFor = (name: "typesafe" | "demo"): ReflexProvider => name === "demo" ? new DemoReflexProvider() : new TypeSafeReflexProvider();
const hash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 16);

/** OpenCode 1.18.31 adapter. Uses only documented V1 hooks; control enters system array, never a user message. */
export const AthenaV1Plugin: V1Plugin = async ({ directory }) => {
  const config = await loadConfig(directory);
  let provider: ReflexProvider;
  try { provider = providerFor(config.provider); } catch { provider = new DemoReflexProvider(); }
  const bridge = new OpenCodeBridge(directory, "OpenCode 1.18.31 session", provider);
  const store = new EventStore(join(directory, ".athena", "events.jsonl"), config.telemetry.persist);
  const actions = new Map<string, Action>();
  const replans = new Map<string, PendingReplan>();
  return {
    "tool.execute.before": async (input, output) => {
      const evaluated = await bridge.before(input.tool, output.args);
      actions.set(input.callID, evaluated.action);
      if (evaluated.policy.decision === "deny" && !evaluated.policy.shadow) throw new Error(`ATHENA denied ${input.tool}: ${evaluated.policy.reason}`);
      if (evaluated.policy.decision === "ask" && !evaluated.policy.shadow) throw new Error(`ATHENA requires approval for ${input.tool}: ${evaluated.policy.reason}`);
    },
    "tool.execute.after": async (input, output) => {
      const action = actions.get(input.callID); actions.delete(input.callID); if (!action) return;
      const judged = await bridge.after(action, true, output.output);
      const active = replans.get(input.sessionID);
      if (active?.state === "injected" && isMeaningful(action)) {
        active.state = "observing";
        const previous = bridge.session.actions.at(-2);
        const changed = previous !== undefined && strategyFamily(action) !== strategyFamily(previous);
        active.state = "resolved";
        active.outcome = changed ? "changed" : "unclear";
        await store.append({ timestamp: new Date().toISOString(), sessionId: bridge.session.id, type: "POST_REPLAN_ACTION", metadata: { adapter: "opencode-v1", runtime: "1.18.31", replanId: active.id, sessionID: input.sessionID, tool: action.tool } });
        await store.append({ timestamp: new Date().toISOString(), sessionId: bridge.session.id, type: "REPLAN_OUTCOME", metadata: { adapter: "opencode-v1", runtime: "1.18.31", replanId: active.id, sessionID: input.sessionID, outcome: active.outcome, meaningfulActionsObserved: 1 } });
      }
      if (!judged.stagnation || judged.policy.decision !== "replan") return;
      const replan: PendingReplan = { id: `replan_${crypto.randomUUID().slice(0, 12)}`, sessionID: input.sessionID, createdAt: Date.now(), stagnationScore: stagnationScore(judged.stagnation), evidence: judged.stagnation, consumed: false, state: "queued" };
      replans.set(input.sessionID, replan);
      await store.append({ timestamp: new Date().toISOString(), sessionId: bridge.session.id, type: "REPLAN_QUEUED", metadata: { adapter: "opencode-v1", runtime: "1.18.31", replanId: replan.id, sessionID: replan.sessionID, stagnationScore: replan.stagnationScore } });
    },
    "experimental.chat.system.transform": async (input, output) => {
      if (!input.sessionID) return;
      const replan = replans.get(input.sessionID);
      if (!replan || replan.consumed || Date.now() - replan.createdAt > STALE_MS) return;
      replan.consumed = true; replan.state = "injected"; replan.instructionHash = hash(CONTROL);
      output.system.push(CONTROL);
      await store.append({ timestamp: new Date().toISOString(), sessionId: bridge.session.id, type: "REPLAN_CONTEXT_APPLIED", metadata: { adapter: "opencode-v1", runtime: "1.18.31", replanId: replan.id, sessionID: replan.sessionID, model: `${input.model.providerID}/${input.model.id}` } });
    },
  };
};
