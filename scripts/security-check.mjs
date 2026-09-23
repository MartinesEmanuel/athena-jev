#!/usr/bin/env node
/** Conservative release guardrail; use a dedicated scanner for history analysis. */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const forbiddenPath = /(?:^|\/)\.env(?:\.|$)|\.(?:pem|p12|pfx)$/i;
const secret = /(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |OPENSSH |)?PRIVATE KEY-----|Authorization:\s*Bearer\s+\S+)/;
const localPath = /\/home\/(?:martins|emanuel)\//;
const findings = [];
for (const file of files) {
  if (forbiddenPath.test(file) && file !== ".env.example") findings.push(`${file}: forbidden credential-like filename`);
  try {
    const text = readFileSync(file, "utf8");
    if (secret.test(text) && !/\/(?:test|fixtures)\//.test(file)) findings.push(`${file}: credential-like content`);
    if (localPath.test(text)) findings.push(`${file}: developer absolute path`);
  } catch { /* Binary files need a separate visual review. */ }
}
if (findings.length) {
  process.stderr.write(`security check failed:\n${findings.join("\n")}\n`);
  process.exit(1);
}
process.stdout.write("security check: tracked files passed\n");
