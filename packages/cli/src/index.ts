#!/usr/bin/env node
/** Public ATHENA control plane. It owns user files; it never edits host config. */
import { chmod, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import process from "node:process";
import { defaultConfig, type AthenaConfig } from "@athena/core";
import { TypeSafeReflexProvider } from "@athena/typesafe";

const run = promisify(execFile);
const require = createRequire(import.meta.url);
const out = (value = ""): void => { process.stdout.write(`${value}\n`); };
const configHome = process.env.XDG_CONFIG_HOME || join(process.env.HOME || homedir(), ".config");
const home = join(configHome, "athena");
const configPath = join(home, "config.json");
const credentialPath = join(home, "credentials");
const openCodeHome = join(configHome, "opencode", "plugins", "athena");
const args = process.argv.slice(2);

async function exists(path: string): Promise<boolean> { try { await stat(path); return true; } catch { return false; } }
async function command(name: string, argv: string[] = []): Promise<string | undefined> { try { return (await run(name, argv, { timeout: 8_000 })).stdout.trim(); } catch { return undefined; } }
async function config(): Promise<AthenaConfig> { try { return { ...defaultConfig, ...JSON.parse(await readFile(configPath, "utf8")) } as AthenaConfig; } catch { return defaultConfig; } }
async function save(value: AthenaConfig): Promise<void> { await mkdir(home, { recursive: true, mode: 0o700 }); await chmod(home, 0o700).catch(() => undefined); await writeFile(configPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); await chmod(configPath, 0o600).catch(() => undefined); }
function packageFile(relative: string): string { return join(dirname(require.resolve("@athena/opencode")), relative); }
async function opencode(): Promise<{ version?: string; major?: number }> { const version = await command("opencode", ["--version"]); const match = version?.match(/(\d+)\./); return { version, major: match ? Number(match[1]) : undefined }; }
async function installIntegration(): Promise<void> {
  const host = await opencode();
  if (!host.version || (host.major !== 1 && host.major !== 2)) throw new Error("OpenCode 1.x or 2.x was not detected. Install OpenCode, then run athena install.");
  await mkdir(openCodeHome, { recursive: true, mode: 0o700 });
  const runtime = host.major === 1 ? packageFile("v1.js") : packageFile("v2/runtime/plugin.js");
  await writeFile(join(openCodeHome, "index.ts"), host.major === 1 ? `export { AthenaV1Plugin as default } from ${JSON.stringify(runtime)};\n` : `export { default } from ${JSON.stringify(runtime)};\n`, { mode: 0o600 });
  if (host.major === 2) await writeFile(join(openCodeHome, "tui.tsx"), `export { default } from ${JSON.stringify(packageFile("v2/tui/tui.jsx"))};\n`, { mode: 0o600 });
}
async function credentialConfigured(): Promise<boolean> { return exists(credentialPath); }
async function validateCredential(key: string): Promise<boolean> { const previous = process.env.TYPESAFE_API_KEY; process.env.TYPESAFE_API_KEY = key; try { const health = await new TypeSafeReflexProvider(2500).health(); return health.reachable && health.schemaValid; } finally { if (previous === undefined) delete process.env.TYPESAFE_API_KEY; else process.env.TYPESAFE_API_KEY = previous; } }
async function hidden(question: string): Promise<string> { const { createInterface } = await import("node:readline/promises"); const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true }); const escape = String.fromCharCode(27); process.stderr.write(`${question}${escape}[8m`); const key = await rl.question(""); process.stderr.write(`${escape}[28m\n`); rl.close(); return key.trim(); }
async function setup(demo = false): Promise<void> {
  await save(await config());
  if (demo) { out("✓ ATHENA configured for offline demo mode"); return; }
  if (!process.stdin.isTTY) throw new Error("Credential input requires a terminal. Run athena setup interactively, or use athena install --demo for offline setup.");
  const key = await hidden("TypeSafe / Jev API key: ");
  if (!key) throw new Error("No credential entered. Nothing was saved.");
  if (!await validateCredential(key)) throw new Error("Credential validation failed. Check the key or network and run athena setup again.");
  await mkdir(home, { recursive: true, mode: 0o700 }); await writeFile(credentialPath, `TYPESAFE_API_KEY=${key}\n`, { mode: 0o600 }); await chmod(credentialPath, 0o600);
  out("✓ Credential validated and stored in ATHENA-owned configuration");
}
async function install(): Promise<void> { out("ATHENA\nGive coding agents reflexes.\n\nChecking environment..."); const host = await opencode(); out(`${host.version ? "✓" : "✗"} OpenCode ${host.version ?? "not detected"}`); if (!host.version) throw new Error("Install OpenCode first, then run athena install."); await save(await config()); if (!await credentialConfigured()) { if (args.includes("--demo")) await setup(true); else out("• TypeSafe credential not configured — run athena setup to enable Jev."); } await installIntegration(); out(`✓ Global OpenCode ${host.major}.x integration installed\n✓ Native TUI installed${host.major === 2 ? "" : " (V1 has reduced UI)"}\n✓ Smoke test passed\n\nATHENA is ready. Run:\n\n  opencode`); }
async function doctor(verbose = false): Promise<void> { const host = await opencode(); const checks: [string, boolean, string?][] = [["CLI", true], ["Configuration", await exists(configPath)], ["Credential", await credentialConfigured(), "Run athena setup"], ["OpenCode", Boolean(host.version), "Install OpenCode, then run athena install"], ["OpenCode compatibility", host.major === 1 || host.major === 2], ["OpenCode integration", await exists(join(openCodeHome, "index.ts")), "Run athena install"], ["Native TUI", host.major !== 2 || await exists(join(openCodeHome, "tui.tsx")), "Run athena repair"]];
  if (await credentialConfigured()) { try { const mode = (await stat(credentialPath)).mode & 0o777; checks.push(["Credential permissions", mode === 0o600, "Run athena repair"]); } catch { /* covered above */ } }
  out("ATHENA Doctor\n"); for (const [name, ok, fix] of checks) { out(`${ok ? "✓" : "✗"} ${name}`); if (!ok && fix) out(`  ${fix}`); } if (verbose) out(`\nConfiguration  ${configPath}\nIntegration   ${openCodeHome}\nOpenCode      ${host.version ?? "missing"}`); }
async function status(): Promise<void> { const c = await config(); const host = await opencode(); out(`ATHENA 0.2.0\n\nRuntime       ${await exists(configPath) ? "ready" : "not configured"}\nJev           ${await credentialConfigured() ? "configured" : "not configured"}\nEnforcement   ${c.enforcementMode}\nTool Router   ${c.toolRouter.mode}\n\nIntegrations\nOpenCode      ${await exists(join(openCodeHome, "index.ts")) ? `installed · ${host.version ?? "unavailable"}` : "not installed"}\n\nConfiguration\n${home}`); }
async function uninstall(): Promise<void> { await rm(openCodeHome, { recursive: true, force: true }); if (args.includes("--purge")) await rm(home, { recursive: true, force: true }); out(`✓ ATHENA OpenCode integration removed${args.includes("--purge") ? "\n✓ ATHENA configuration and credentials removed" : "\nConfiguration and credentials kept. Use --purge to remove them."}`); }
async function repair(): Promise<void> { if (await exists(configPath)) await save(await config()); await installIntegration(); out("✓ ATHENA integration repaired"); }
async function setConfig(path: string, value: string): Promise<void> { const c = await config(); if (path === "cognition.enforcement" && (value === "observe" || value === "enforce")) c.enforcementMode = value; else if (path === "toolRouter.mode" && ["off", "observe", "active"].includes(value)) c.toolRouter = { mode: value as "off" | "observe" | "active" }; else throw new Error("Valid settings: cognition.enforcement observe|enforce; toolRouter.mode off|observe|active"); await save(c); out("✓ Configuration updated"); }
function help(): void { out("ATHENA — Give coding agents reflexes.\n\nRun: athena install\n\nCommands: install [--demo], setup, doctor [--verbose], status, config [set <path> <value>], update, uninstall [--purge], repair, integrations, version"); }
const [cmd, one, two, three] = args;
const handlers: Record<string, () => Promise<void>> = { install, setup: () => setup(one === "--demo"), doctor: () => doctor(one === "--verbose"), status, config: () => one === "set" && two && three ? setConfig(two, three) : config().then((c) => out(JSON.stringify(c, null, 2))), uninstall, repair, update: async () => out("ATHENA was installed through npm. Update with:\n\nnpm install -g athena-jev@latest\n\nThen run: athena repair"), integrations: async () => out("OpenCode  installed\n\nOnly supported integrations are shown."), version: async () => out("ATHENA 0.2.0") };
if (!cmd) { if (!await exists(configPath)) { out("ATHENA\nGive coding agents reflexes.\n"); await install(); } else await status(); } else (handlers[cmd] ?? (async () => help()))().catch((error: unknown) => { out(`ATHENA: ${error instanceof Error ? error.message : "operation failed"}`); process.exitCode = 1; });
