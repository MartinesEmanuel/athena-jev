import { randomUUID } from "node:crypto";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HudSocketServer, renderHud } from "../src/sidecar.js";

const socketPath = () => join(tmpdir(), `athena-hud-${randomUUID()}.sock`);
const send = (path: string, text: string) => new Promise<void>((resolve, reject) => { const socket = connect(path, () => socket.end(text, resolve)); socket.on("error", reject); });
const snapshot = (reason: string) => JSON.stringify({
  version: 1, sessionId: "session-42", timestamp: 0, status: "ASSESSING", decision: "NONE", reason,
  system1: { state: "CLEAR", confidence: 0.9 }, aegis: { state: "CLEAR", confidence: 0.8 }, metis: { state: "WATCH", confidence: 0.6 }, nike: { state: "UNKNOWN", confidence: 0 },
  epistemics: { state: "GROUNDED", confidence: 0.7 }, system2: { state: "IDLE" },
  session: { actions: 2, meaningfulActions: 1, replans: 0, system1Calls: 3, system2Calls: 0 },
  timeline: [{ timestamp: 0, type: "ASSESSMENT", status: "ASSESSING", decision: "NONE", reason: "checked" }],
}) + "\n";
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("HUD socket sidecar", () => {
  it("ignores malformed messages and handles disconnected producers", async () => {
    const output: string[] = [];
    const path = socketPath();
    const hud = new HudSocketServer(path, (text) => output.push(text));
    await hud.start();
    await send(path, "not json\n");
    await send(path, snapshot("safe"));
    await settle();
    expect(output.at(-1)).toContain("safe");
    await hud.stop();
  });

  it("coalesces rapid snapshots and renders latest state", async () => {
    const output: string[] = [];
    const path = socketPath();
    const hud = new HudSocketServer(path, (text) => output.push(text));
    await hud.start();
    await send(path, Array.from({ length: 50 }, (_, index) => snapshot(`event ${index}`)).join(""));
    await settle();
    expect(output.at(-1)).toContain("event 49");
    expect(output.length).toBeLessThan(5);
    await hud.stop();
  });

  it("renders compact and detail terminal views", () => {
    const value = JSON.parse(snapshot("safe"));
    expect(renderHud(value, false)).toContain("S1 Clear 90%");
    expect(renderHud(value, false)).not.toContain("Timeline");
    expect(renderHud(value, true)).toContain("Timeline");
    expect(renderHud(value, true)).toContain("Epistemics Grounded 70%");
  });
});
