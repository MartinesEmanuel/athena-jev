import type { Plugin as V1Plugin } from "@opencode-ai/plugin-v1";
import { createTypeSafeSystem1 } from "@athena/typesafe";
import { CognitiveRuntime } from "../shared/cognitive-runtime.js";
import { createHudSocketObserver } from "../shared/hud-observer.js";
import { loadAthenaCredentials } from "../shared/credentials.js";

/** OpenCode 1.x adapter. V1 exposes tool hooks and privileged system transform only. */
export const AthenaV1Plugin: V1Plugin = async () => {
  // ATHENA owns its credentials: never read secrets from host config.
  loadAthenaCredentials();
  const cognitive = new CognitiveRuntime(createTypeSafeSystem1(), undefined, createHudSocketObserver());
  return {
    "chat.message": async (input, output) => {
      cognitive.capturePrompt(input.sessionID, output.parts);
    },
    "tool.execute.before": async (input, output) => {
      await cognitive.before(input.sessionID, input.callID, input.tool, output.args);
    },
    "tool.execute.after": async (input, output) => {
      cognitive.after(input.sessionID, input.callID, input.tool, "completed", output.output);
    },
    "experimental.chat.system.transform": async (input, output) => {
      if (!input.sessionID) return;
      const context = cognitive.injectContext(input.sessionID);
      if (context) output.system.push(context);
    },
  };
};
