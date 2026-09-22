import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { athenaCredentialPaths, loadAthenaCredentials, parseCredentialFile } from "../src/index.js";

const SECRET = "tsk_do_not_leak_0123456789";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "athena-credentials-"));
}

describe("ATHENA-owned credentials", () => {
  it("parses KEY=value lines, comments, and bare single-line secrets", () => {
    expect(parseCredentialFile(`# ATHENA credentials\n\nTYPESAFE_API_KEY=${SECRET}\nOTHER= value \n`)).toEqual({
      TYPESAFE_API_KEY: SECRET,
      OTHER: "value",
    });
    expect(parseCredentialFile(`${SECRET}\n`)).toEqual({ TYPESAFE_API_KEY: SECRET });
  });

  it("resolves ATHENA-owned paths in priority order", () => {
    const env: NodeJS.ProcessEnv = { ATHENA_CREDENTIALS: "/run/athena/creds", XDG_CONFIG_HOME: "/xdg", HOME: "/home/u" };
    expect(athenaCredentialPaths(env)).toEqual([
      "/run/athena/creds",
      join("/xdg", "athena", "credentials"),
      join("/home/u", ".athena", "credentials"),
    ]);
    expect(athenaCredentialPaths({ HOME: "/home/u" })).toEqual([join("/home/u", ".athena", "credentials")]);
  });

  it("loads the key into env without ever returning the secret", () => {
    const dir = tempDir();
    const file = join(dir, "credentials");
    writeFileSync(file, `TYPESAFE_API_KEY=${SECRET}\n`, { mode: 0o600 });
    chmodSync(file, 0o600);
    const env: NodeJS.ProcessEnv = { ATHENA_CREDENTIALS: file };
    const result = loadAthenaCredentials(env);
    expect(result.loaded).toBe(true);
    expect(result.source).toBe(file);
    expect(env.TYPESAFE_API_KEY).toBe(SECRET);
    // The reported result must be log-safe: path only, never a credential.
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(JSON.stringify(result)).not.toContain("TYPESAFE_API_KEY=");
  });

  it("falls back from XDG to home and loads nothing when no file exists", () => {
    const home = tempDir();
    const xdg = tempDir();
    // No file anywhere: nothing loads, env untouched.
    const empty: NodeJS.ProcessEnv = { XDG_CONFIG_HOME: xdg, HOME: home };
    expect(loadAthenaCredentials(empty)).toEqual({ loaded: false });
    expect(empty.TYPESAFE_API_KEY).toBeUndefined();

    // XDG wins when both exist.
    mkdirSync(join(xdg, "athena"), { recursive: true });
    mkdirSync(join(home, ".athena"), { recursive: true });
    writeFileSync(join(xdg, "athena", "credentials"), `TYPESAFE_API_KEY=xdg_${SECRET}\n`);
    writeFileSync(join(home, ".athena", "credentials"), `TYPESAFE_API_KEY=home_${SECRET}\n`);
    const both: NodeJS.ProcessEnv = { XDG_CONFIG_HOME: xdg, HOME: home };
    expect(loadAthenaCredentials(both)).toEqual({ loaded: true, source: join(xdg, "athena", "credentials") });
    expect(both.TYPESAFE_API_KEY).toBe(`xdg_${SECRET}`);

    // Home only when the XDG file is absent.
    const homeOnly: NodeJS.ProcessEnv = { XDG_CONFIG_HOME: tempDir(), HOME: home };
    expect(loadAthenaCredentials(homeOnly)).toEqual({ loaded: true, source: join(home, ".athena", "credentials") });
    expect(homeOnly.TYPESAFE_API_KEY).toBe(`home_${SECRET}`);
  });

  it("prefers the explicit ATHENA_CREDENTIALS file over all others", () => {
    const explicit = join(tempDir(), "explicit");
    writeFileSync(explicit, `TYPESAFE_API_KEY=${SECRET}\n`);
    const env: NodeJS.ProcessEnv = { ATHENA_CREDENTIALS: explicit, XDG_CONFIG_HOME: tempDir(), HOME: tempDir() };
    const result = loadAthenaCredentials(env);
    expect(result).toEqual({ loaded: true, source: explicit });
    expect(env.TYPESAFE_API_KEY).toBe(SECRET);
  });

  it("skips a missing explicit file and continues to the XDG location", () => {
    const xdg = tempDir();
    mkdirSync(join(xdg, "athena"), { recursive: true });
    writeFileSync(join(xdg, "athena", "credentials"), `TYPESAFE_API_KEY=${SECRET}\n`);
    const env: NodeJS.ProcessEnv = { ATHENA_CREDENTIALS: join(tempDir(), "does-not-exist"), XDG_CONFIG_HOME: xdg, HOME: tempDir() };
    const result = loadAthenaCredentials(env);
    expect(result).toEqual({ loaded: true, source: join(xdg, "athena", "credentials") });
    expect(env.TYPESAFE_API_KEY).toBe(SECRET);
  });
});
