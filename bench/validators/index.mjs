/* global process, setTimeout, clearTimeout */
import { access, lstat, readFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";

const exists = async (path) => access(path).then(() => true, () => false);

const VALIDATOR_GRACE_MS = 3000;
const VALIDATOR_IMAGE = "athena-bench-shell:latest";
const VALIDATOR_IMAGE_ID = "sha256:53c63250fce11b423bcfaaff06378cd115b37c8974bc9c9d8839d144ff36c098";
const HELDOUT_VALIDATOR_ROOT = resolve(process.cwd(), "bench", "validators", "heldout");
function run(command, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let timedOut = false;
    let forcedKill = false;
    let terminationSignal = null;
    let graceTimer;
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    const timer = setTimeout(() => {
      timedOut = true;
      terminationSignal = "SIGTERM";
      child.kill("SIGTERM");
      graceTimer = setTimeout(() => {
        forcedKill = true;
        terminationSignal = "SIGKILL";
        child.kill("SIGKILL");
      }, VALIDATOR_GRACE_MS);
    }, timeoutMs);
    child.on("close", (code, signal) => { clearTimeout(timer); clearTimeout(graceTimer); resolve({ code, signal, output, timedOut, terminationSignal, forcedKill }); });
    child.on("error", (error) => { clearTimeout(timer); clearTimeout(graceTimer); resolve({ code: null, signal: null, output: error.message, timedOut, terminationSignal, forcedKill }); });
  });
}

function interpolateCommand(command, context) {
  const knownPlaceholders = new Set(["runRoot", "fixtureRoot"]);
  return command.map((arg) => {
    if (typeof arg !== "string") return arg;
    return arg.replace(/\{(\w+)\}/g, (match, name) => {
      if (!knownPlaceholders.has(name)) throw new Error(`Unknown validator placeholder: ${name}`);
      if (context[name] === undefined) throw new Error(`Validator placeholder ${name} has no value`);
      return context[name];
    });
  });
}

async function hashDirectory(path, root) {
  const hash = createHash("sha256");
  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const fullPath = join(path, entry.name);
    hash.update(relative(root, fullPath));
    hash.update("\0");
    if (entry.isDirectory()) hash.update(await hashDirectory(fullPath, root));
    else hash.update(await readFile(fullPath));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export async function pathState(root, logicalPath) {
  const path = resolve(root, logicalPath);
  if (path !== resolve(root) && !path.startsWith(`${resolve(root)}/`)) throw new Error(`Protected path escapes workspace: ${logicalPath}`);
  try {
    const metadata = await lstat(path);
    if (metadata.isDirectory()) return { kind: "directory", hash: await hashDirectory(path, path) };
    if (metadata.isFile()) return { kind: "file", hash: createHash("sha256").update(await readFile(path)).digest("hex") };
    return { kind: "other" };
  } catch (error) {
    if (error?.code === "ENOENT") return { kind: "absent" };
    throw error;
  }
}

export async function capturePathStates(root, paths) {
  return new Map(await Promise.all(paths.map(async (path) => [path, await pathState(root, path)])));
}

function sanitizeValidatorOutput(output, runRoot, validatorRoot) {
  return output.replaceAll(runRoot, "$WORKSPACE").replaceAll(validatorRoot, "$VALIDATOR").slice(0, 4000);
}

export async function runHeldoutValidator({ caseId, runRoot, validatorRoot = HELDOUT_VALIDATOR_ROOT, timeoutMs }) {
  const workspaceBefore = await pathState(runRoot, ".");
  const inspect = await run(["docker", "image", "inspect", "--format", "{{.Id}}", VALIDATOR_IMAGE], process.cwd(), timeoutMs);
  if (inspect.code !== 0 || inspect.output.trim() !== VALIDATOR_IMAGE_ID) {
    return { success: false, evidence: [{ type: "heldout-validator-sandbox", image: VALIDATOR_IMAGE, imageId: inspect.output.trim() || null, imageVerified: false }] };
  }
  const result = await run([
    "docker", "run", "--rm", "--network", "none", "--read-only", "--user", "1000:1000",
    "--tmpfs", "/tmp:rw,nosuid,nodev,noexec",
    "--mount", `type=bind,src=${resolve(runRoot)},dst=/workspace,readonly`,
    "--mount", `type=bind,src=${resolve(validatorRoot)},dst=/validator,readonly`,
    "--workdir", "/workspace", "--env", "HOME=/tmp", "--entrypoint", "node",
    VALIDATOR_IMAGE, "/validator/validate-case.mjs", caseId, "/workspace",
  ], process.cwd(), timeoutMs);
  const workspaceAfter = await pathState(runRoot, ".");
  const workspaceUnchanged = JSON.stringify(workspaceBefore) === JSON.stringify(workspaceAfter);
  const success = result.code === 0 && workspaceUnchanged;
  return {
    success,
    evidence: [{
      type: "heldout-validator-sandbox",
      validator: "heldout-case",
      caseId,
      image: VALIDATOR_IMAGE,
      imageId: VALIDATOR_IMAGE_ID,
      imageVerified: true,
      network: "none",
      workspaceMount: "read-only",
      validatorMount: "read-only",
      workspaceUnchanged,
      exitCode: result.code,
      signal: result.signal,
      timedOut: result.timedOut,
      terminationSignal: result.terminationSignal,
      forcedKill: result.forcedKill,
      output: sanitizeValidatorOutput(result.output, resolve(runRoot), resolve(validatorRoot)),
    }],
  };
}

export async function validateRun({ fixtureRoot, runRoot, validator, baselineFiles, timeoutMs = 30_000 }) {
  const evidence = [];
  let success = false;
  const context = { runRoot, fixtureRoot };
  if (validator.kind === "file-present") {
    const path = join(runRoot, validator.path);
    const present = await exists(path) && (await stat(path)).size > 0;
    evidence.push({ type: "required-file", path: validator.path, present });
    success = present;
  }
  if (validator.kind === "command") {
    try {
      const interpolatedCommand = interpolateCommand(validator.command, context);
      const result = await run(interpolatedCommand, runRoot, timeoutMs);
      success = result.code === validator.expectedExit;
      evidence.push({ type: "command", command: interpolatedCommand, exitCode: result.code, signal: result.signal, timedOut: result.timedOut, terminationSignal: result.terminationSignal, forcedKill: result.forcedKill, output: result.output.slice(0, 4000) });
    } catch (error) {
      evidence.push({ type: "command-interpolation", rejected: true, error: error instanceof Error ? error.message : String(error) });
      success = false;
    }
  }
  if (validator.kind === "heldout-case") {
    const heldout = await runHeldoutValidator({ caseId: validator.caseId, runRoot, timeoutMs });
    success = heldout.success;
    evidence.push(...heldout.evidence);
  }
  for (const path of validator.forbiddenPaths ?? []) {
    const before = baselineFiles?.get(path) ?? { kind: "absent" };
    const after = await pathState(runRoot, path);
    const unchanged = JSON.stringify(before) === JSON.stringify(after);
    evidence.push({ type: "forbidden-change", path, unchanged });
    success &&= unchanged;
  }
  return { success, evidence, validator: validator.kind === "heldout-case" ? { kind: validator.kind, caseId: validator.caseId } : { kind: validator.kind } };
}
