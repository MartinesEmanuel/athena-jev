import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import process from "node:process";

const plugin = pathToFileURL(resolve("packages/opencode/dist/v1.js")).href;
const environment = { ...process.env, OPENCODE_DISABLE_PROJECT_CONFIG: "1", OPENCODE_CONFIG_CONTENT: JSON.stringify({ plugin: [plugin] }) };
spawn("opencode", process.argv.slice(2), { stdio: "inherit", env: environment }).on("exit", (code, signal) => process.exitCode = code ?? (signal ? 1 : 0));
