import { spawn } from "node:child_process";
import process from "node:process";

const args = process.argv.slice(2);
const tmux = spawn("tmux", ["-V"], { stdio: "ignore" });

tmux.once("error", () => launch());
tmux.once("exit", (code) => {
  if (code === 0) {
    const session = `athena-${process.pid}`;
    const child = spawn("tmux", ["new-session", "-s", session, process.execPath, "scripts/athena-opencode.mjs", ...args], { stdio: "inherit" });
    child.on("exit", (childCode, signal) => { process.exitCode = childCode ?? (signal ? 1 : 0); });
  } else launch();
});

function launch() {
  const child = spawn(process.execPath, ["scripts/athena-opencode.mjs", ...args], { stdio: "inherit" });
  child.on("exit", (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
}
