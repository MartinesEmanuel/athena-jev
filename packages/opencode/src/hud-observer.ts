import { connect } from "node:net";
import type { AthenaHudObserver, AthenaHudSnapshot } from "@athena/hud-protocol";

export function createHudSocketObserver(socketPath = process.env.ATHENA_HUD_SOCKET): AthenaHudObserver | undefined {
  if (!socketPath) return undefined;
  return {
    publish(snapshot: AthenaHudSnapshot): void {
      const socket = connect(socketPath);
      socket.on("error", () => undefined);
      socket.end(`${JSON.stringify(snapshot)}\n`);
    },
  };
}
