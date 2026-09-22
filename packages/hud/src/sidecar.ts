#!/usr/bin/env node
import { createServer, type Server, type Socket } from "node:net";
import { lstat, rm } from "node:fs/promises";
import process from "node:process";
import { athenaHudSnapshotSchema, hudAssessmentLabel, hudDecisionLabel, hudEpistemicsLabel, hudStatusLabel, hudSystem2Label, hudTimelineLabel, type AthenaHudSnapshot } from "@athena/hud-protocol";

const ansi = { clear: "\x1b[2J\x1b[H", reset: "\x1b[0m", dim: "\x1b[2m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", green: "\x1b[32m" };
const statusColor: Record<AthenaHudSnapshot["status"], string> = { IDLE: ansi.dim, ASSESSING: ansi.cyan, GO: ansi.green, DELIBERATE: ansi.yellow, VERIFY: ansi.cyan, BLOCK: ansi.red, SYSTEM2: ansi.yellow, DEGRADED: ansi.red };
const assessment = (name: string, value: AthenaHudSnapshot["system1"]) => `${name} ${hudAssessmentLabel[value.state]} ${Math.round(value.confidence * 100)}%`;

export function renderHud(snapshot: AthenaHudSnapshot | undefined, detail = false): string {
  if (!snapshot) return `${ansi.clear}${ansi.cyan}ATHENA${ansi.reset} ${ansi.dim}waiting for snapshot${ansi.reset}\n\n${ansi.dim}[d] detail  [q] quit${ansi.reset}\n`;
  const lines = [
    `${ansi.cyan}ATHENA${ansi.reset} ${statusColor[snapshot.status]}${hudStatusLabel[snapshot.status]}${ansi.reset}  ${hudDecisionLabel[snapshot.decision]}`,
    snapshot.reason,
    `${ansi.dim}${assessment("S1", snapshot.system1)} | ${assessment("Aegis", snapshot.aegis)} | ${assessment("Metis", snapshot.metis)} | ${assessment("Nike", snapshot.nike)}${ansi.reset}`,
    `${ansi.dim}Actions ${snapshot.session.actions}  Replans ${snapshot.session.replans}  S1 ${snapshot.session.system1Calls}  S2 ${snapshot.session.system2Calls}${ansi.reset}`,
  ];
  if (detail) {
    lines.push(`${ansi.dim}Epistemics ${hudEpistemicsLabel[snapshot.epistemics.state]} ${Math.round(snapshot.epistemics.confidence * 100)}%  System 2 ${hudSystem2Label[snapshot.system2.state]}${snapshot.system2.confidence === undefined ? "" : ` ${Math.round(snapshot.system2.confidence * 100)}%`}${ansi.reset}`);
    lines.push("", `${ansi.dim}Timeline${ansi.reset}`);
    for (const event of snapshot.timeline) lines.push(`${ansi.dim}${new Date(event.timestamp).toLocaleTimeString()}${ansi.reset} ${hudTimelineLabel[event.type]} ${hudStatusLabel[event.status]} ${hudDecisionLabel[event.decision]}${event.reason ? ` ${event.reason}` : ""}`);
  }
  lines.push("", `${ansi.dim}[d] ${detail ? "compact" : "detail"}  [q] quit${ansi.reset}`);
  return `${ansi.clear}${lines.join("\n")}\n`;
}

export class HudSocketServer {
  private server: Server | undefined;
  private snapshot: AthenaHudSnapshot | undefined;
  private detail = false;
  private renderQueued = false;

  constructor(private readonly socketPath: string, private readonly write: (text: string) => void = (text) => process.stdout.write(text)) {}

  async start(): Promise<void> {
    await this.removeStaleSocket();
    this.server = createServer((socket) => this.handleSocket(socket));
    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(this.socketPath, resolve);
    });
    this.render();
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
    this.server = undefined;
    await this.removeStaleSocket();
  }

  toggleDetail(): void { this.detail = !this.detail; this.render(); }

  private handleSocket(socket: Socket): void {
    let buffer = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      if (buffer.length > 32_768) { buffer = ""; socket.destroy(); return; }
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) this.acceptLine(line);
    });
    socket.on("error", () => undefined);
  }

  private acceptLine(line: string): void {
    if (!line.trim()) return;
    try {
      const snapshot = athenaHudSnapshotSchema.parse(JSON.parse(line));
      this.snapshot = snapshot;
      if (!this.renderQueued) {
        this.renderQueued = true;
        setImmediate(() => { this.renderQueued = false; this.render(); });
      }
    } catch { /* Ignore malformed or unsafe producer messages. */ }
  }

  private async removeStaleSocket(): Promise<void> {
    try {
      const entry = await lstat(this.socketPath);
      if (!entry.isSocket()) throw new Error(`HUD socket path is not a socket: ${this.socketPath}`);
      await rm(this.socketPath);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  private render(): void { this.write(renderHud(this.snapshot, this.detail)); }
}

function socketPathFromArguments(): string {
  const index = process.argv.indexOf("--socket");
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : process.env.ATHENA_HUD_SOCKET ?? "/tmp/athena-hud.sock";
}

async function main(): Promise<void> {
  const hud = new HudSocketServer(socketPathFromArguments());
  await hud.start();
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", (data: Buffer) => { if (data.toString() === "d") hud.toggleDetail(); if (data.toString() === "q" || data[0] === 3) void hud.stop().then(() => process.exit()); });
  }
  process.once("SIGINT", () => void hud.stop().then(() => process.exit()));
  process.once("SIGTERM", () => void hud.stop().then(() => process.exit()));
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) void main();
