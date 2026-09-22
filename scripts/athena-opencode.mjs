import { spawn } from "node:child_process";
import console from "node:console";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import process from "node:process";

const socketPath = join(tmpdir(), `athena-hud-${process.pid}-${Date.now()}.sock`);
const hud = resolve("packages/hud/dist/sidecar.js");
let hudPane;
let fallbackSidecar;

const plugin = pathToFileURL(
  resolve("packages/opencode/dist/v1.js")
).href;

const environment = {
  ...process.env,
  OPENCODE_DISABLE_PROJECT_CONFIG: "1",
  OPENCODE_CONFIG_CONTENT: JSON.stringify({
    plugin: [plugin],
  }),
  ATHENA_HUD_SOCKET: socketPath,
};

const rawArgs = process.argv.slice(2);

// pnpm `--` may arrive literally at the child script.
// OpenCode must not receive this separator.
const args = rawArgs[0] === "--"
  ? rawArgs.slice(1)
  : rawArgs;

function startHud() {
  if (process.env.TMUX) {
    const pane = spawn("tmux", ["split-window", "-h", "-P", "-F", "#{pane_id}", process.execPath, hud, "--socket", socketPath], { stdio: ["ignore", "pipe", "ignore"], env: environment });
    pane.stdout.on("data", (value) => { hudPane = value.toString().trim(); });
    pane.on("error", () => { fallbackSidecar = startDetachedHud(); });
    pane.on("exit", (code) => { if (code !== 0) fallbackSidecar = startDetachedHud(); });
    return pane;
  }
  console.error(`[ATHENA launcher] tmux unavailable. HUD: node ${hud} --socket ${socketPath}`);
  return startDetachedHud();
}

function startDetachedHud() {
  const sidecar = spawn(process.execPath, [hud, "--socket", socketPath], { stdio: "ignore", env: environment });
  sidecar.on("error", () => undefined);
  return sidecar;
}

function cleanup(sidecar) {
  if (sidecar && !sidecar.killed) sidecar.kill("SIGTERM");
  if (fallbackSidecar && !fallbackSidecar.killed) fallbackSidecar.kill("SIGTERM");
  if (hudPane) spawn("tmux", ["kill-pane", "-t", hudPane], { stdio: "ignore" });
  rmSync(socketPath, { force: true });
}

async function waitForSocket() {
  const deadline = Date.now() + 1_000;
  while (!existsSync(socketPath) && Date.now() < deadline) await setTimeout(20);
}

const sidecar = startHud();
await waitForSocket();

console.error("[ATHENA launcher] plugin:", plugin);
console.error("[ATHENA launcher] args:", JSON.stringify(args));
console.error("[ATHENA launcher] HUD socket:", socketPath);

const child = spawn("opencode", args, {
  stdio: "inherit",
  env: environment,
});

child.on("error", (error) => {
  console.error("[ATHENA launcher] failed to start OpenCode:", error.message);
  cleanup(sidecar);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  console.error(
    `[ATHENA launcher] OpenCode exited: code=${code ?? "null"} signal=${signal ?? "none"}`
  );

  cleanup(sidecar);
  process.exitCode = code ?? (signal ? 1 : 0);
});

process.once("SIGINT", () => cleanup(sidecar));
process.once("SIGTERM", () => cleanup(sidecar));
