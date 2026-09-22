import { spawn } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";

const child = spawn(process.execPath, [resolve("packages/hud/dist/sidecar.js"), ...process.argv.slice(2)], { stdio: "inherit" });
child.on("exit", (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
