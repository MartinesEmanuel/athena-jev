/* global setTimeout, clearTimeout */
import { access, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

const exists = async (path) => access(path).then(() => true, () => false);

function run(command, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.on("close", (code, signal) => { clearTimeout(timer); resolve({ code, signal, output }); });
    child.on("error", (error) => { clearTimeout(timer); resolve({ code: null, signal: null, output: error.message }); });
  });
}

export async function validateRun({ fixtureRoot, runRoot, validator, baselineFiles }) {
  const evidence = [];
  let success = false;
  if (validator.kind === "file-present") {
    const path = join(runRoot, validator.path);
    const present = await exists(path) && (await stat(path)).size > 0;
    evidence.push({ type: "required-file", path: validator.path, present });
    success = present;
  }
  if (validator.kind === "command") {
    const result = await run(validator.command, runRoot, 30_000);
    success = result.code === validator.expectedExit;
    evidence.push({ type: "command", command: validator.command, exitCode: result.code, signal: result.signal, output: result.output.slice(0, 4000) });
  }
  for (const path of validator.forbiddenPaths ?? []) {
    const before = baselineFiles.get(path);
    const after = await readFile(join(runRoot, path), "utf8").catch(() => undefined);
    const unchanged = before === after;
    evidence.push({ type: "forbidden-change", path, unchanged });
    success &&= unchanged;
  }
  return { success, evidence, fixtureRoot };
}
