import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * ATHENA-owned credential storage.
 *
 * Secrets never live in OpenCode configuration (service.json, opencode.json,
 * config files): ATHENA reads them from ATHENA-owned files and injects them
 * into the process environment before any provider client is constructed.
 * No function here ever returns, logs or throws a credential value.
 */

/** ATHENA-owned credential file locations, highest priority first. */
export function athenaCredentialPaths(env: NodeJS.ProcessEnv = process.env): string[] {
  const paths: string[] = [];
  if (env.ATHENA_CREDENTIALS) paths.push(env.ATHENA_CREDENTIALS);
  const home = env.HOME || homedir();
  if (env.XDG_CONFIG_HOME) paths.push(join(env.XDG_CONFIG_HOME, "athena", "credentials"));
  if (home) paths.push(join(home, ".athena", "credentials"));
  return paths;
}

/**
 * Parses `KEY=value` lines. A single line without `=` is treated as a bare
 * TYPESAFE_API_KEY value. Comments (`#`) and blank lines are ignored.
 */
export function parseCredentialFile(content: string): Record<string, string> {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  if (lines.length === 1 && !lines[0].includes("=")) {
    return { TYPESAFE_API_KEY: lines[0] };
  }
  const result: Record<string, string> = {};
  for (const line of lines) {
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}

export interface AthenaCredentialLoad {
  /** True when an ATHENA-owned file supplied at least one credential. */
  readonly loaded: boolean;
  /** Source file path only. Never includes a credential value. */
  readonly source?: string;
}

/**
 * Loads ATHENA-owned credentials into `env`. The first file that provides a
 * value wins. Unreadable files are skipped. The result is safe to log: it
 * carries a path, never a secret.
 */
export function loadAthenaCredentials(env: NodeJS.ProcessEnv = process.env): AthenaCredentialLoad {
  for (const path of athenaCredentialPaths(env)) {
    try {
      if (!existsSync(path)) continue;
      const credentials = parseCredentialFile(readFileSync(path, "utf8"));
      let loaded = false;
      for (const [key, value] of Object.entries(credentials)) {
        if (!key || !value) continue;
        env[key] = value;
        loaded = true;
      }
      if (loaded) return { loaded: true, source: path };
    } catch {
      // A broken credential file must degrade exactly like a missing one.
    }
  }
  return { loaded: false };
}
