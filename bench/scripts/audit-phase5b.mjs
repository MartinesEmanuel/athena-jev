/* global console, process */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CASES = path.join(ROOT, "bench/cases");
const FIXTURES = path.join(ROOT, "evals/fixtures");
const GOLD = path.join(ROOT, "bench/gold/heldout");
const ids = Array.from({ length: 30 }, (_, i) => `lp-${String(i + 1).padStart(2, "0")}`);

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function hash(data) { return crypto.createHash("sha256").update(data).digest("hex"); }
function filesRecursive(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) out.push(...filesRecursive(full)); else out.push(full);
  }
  return out;
}
function fixtureFingerprint(dir) {
  const h = crypto.createHash("sha256");
  for (const file of filesRecursive(dir)) {
    h.update(path.relative(dir, file)); h.update("\0"); h.update(fs.readFileSync(file)); h.update("\0");
  }
  return h.digest("hex");
}
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name), to = path.join(dst, name), st = fs.statSync(from);
    if (st.isDirectory()) copyDir(from, to); else fs.copyFileSync(from, to);
  }
}
function tempDir(id, suffix) {
  const base = process.env.HOME || process.cwd();
  return fs.mkdtempSync(path.join(base, `.athena-${id}-${suffix}-`));
}
function validatorResult(id, workspace) {
  const validatorDir = path.join(ROOT, "bench/validators/heldout");
  const args = [
    "run", "--rm", "--network", "none", "--read-only", "--user", "1000:1000",
    "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m", "-e", "HOME=/tmp",
    "-v", `${workspace}:/workspace:ro`, "-v", `${validatorDir}:/validator:ro`,
    "athena-bench-shell:latest", "node", "/validator/validate-case.mjs", id, "/workspace"
  ];
  const r = spawnSync("docker", args, { cwd: ROOT, encoding: "utf8", env: { PATH: process.env.PATH, HOME: process.env.HOME } });
  return { pass: r.status === 0, status: r.status, stdout: r.stdout?.trim() ?? "", stderr: r.stderr?.trim() ?? "" };
}
function findPrompt(c) { return String(c.taskPrompt ?? c.prompt ?? c.task ?? ""); }
function cheatVisibleTests(workspace) {
  for (const file of filesRecursive(workspace)) {
    const base = path.basename(file).toLowerCase();
    if (base.startsWith("test-") && base.endsWith(".js") || base === "test-visible.js" || base.includes("test") && base.endsWith(".js")) {
      fs.writeFileSync(file, 'console.log("PASS");\n');
    }
  }
}

const categoryCounts = {}, promptHashes = new Map(), fixtureHashes = new Map(), rows = [];
for (const id of ids) {
  const caseFile = path.join(CASES, `${id}.json`), fixture = path.join(FIXTURES, id), gold = path.join(GOLD, id);
  const row = { id, category: "?", initial: "NOT_RUN", gold: "MISSING", cheat: "NOT_RUN", promptDuplicate: false, fixtureDuplicate: false, leakage: [], files: 0 };
  if (!fs.existsSync(caseFile)) { row.initial = "NO_CASE"; rows.push(row); continue; }
  if (!fs.existsSync(fixture)) { row.initial = "NO_FIXTURE"; rows.push(row); continue; }
  const c = readJson(caseFile); row.category = c.category ?? "?"; categoryCounts[row.category] = (categoryCounts[row.category] ?? 0) + 1;
  const prompt = findPrompt(c), normalizedPrompt = prompt.trim().toLowerCase(), ph = hash(normalizedPrompt);
  if (promptHashes.has(ph)) row.promptDuplicate = true; else promptHashes.set(ph, id);
  for (const term of ["semantic-loop","semantic loop","legitimate-progress","mixed-debugging","athena","metis","replan","control","treatment"]) if (normalizedPrompt.includes(term)) row.leakage.push(term);
  const ff = fixtureFingerprint(fixture); if (fixtureHashes.has(ff)) row.fixtureDuplicate = true; else fixtureHashes.set(ff, id);
  row.files = filesRecursive(fixture).length;

  const brokenTmp = tempDir(id, "broken"); copyDir(fixture, brokenTmp); const broken = validatorResult(id, brokenTmp); row.initial = broken.pass ? "PASS_BAD" : "FAIL_OK"; fs.rmSync(brokenTmp,{recursive:true,force:true});
  if (fs.existsSync(gold)) {
    const goldTmp=tempDir(id,"gold"); copyDir(fixture,goldTmp); copyDir(gold,goldTmp); const solved=validatorResult(id,goldTmp); row.gold=solved.pass?"PASS_OK":"FAIL_BAD"; fs.rmSync(goldTmp,{recursive:true,force:true});
  }
  const cheatTmp=tempDir(id,"cheat"); copyDir(fixture,cheatTmp); cheatVisibleTests(cheatTmp); const cheated=validatorResult(id,cheatTmp); row.cheat=cheated.pass?"PASS_BAD":"FAIL_OK"; fs.rmSync(cheatTmp,{recursive:true,force:true});
  rows.push(row);
}

console.log("\nATHENA PHASE 5B — CORPUS AUDIT V2\n");
console.log("Categories:"); for (const [k,v] of Object.entries(categoryCounts).sort()) console.log(`  ${k}: ${v}`);
console.log("\nCases:");
console.log("ID     CATEGORY              INITIAL   GOLD       CHEAT     FILES  LEAK  DUP-P  DUP-F");
for (const r of rows) console.log([r.id.padEnd(6),String(r.category).padEnd(21),r.initial.padEnd(9),r.gold.padEnd(10),r.cheat.padEnd(9),String(r.files).padEnd(6),String(r.leakage.length).padEnd(5),String(r.promptDuplicate).padEnd(6),String(r.fixtureDuplicate)].join(" "));
const initialGood=rows.filter(r=>r.initial==="FAIL_OK").length, goldGood=rows.filter(r=>r.gold==="PASS_OK").length, cheatGood=rows.filter(r=>r.cheat==="FAIL_OK").length;
const leaks=rows.filter(r=>r.leakage.length), dupPrompts=rows.filter(r=>r.promptDuplicate), dupFixtures=rows.filter(r=>r.fixtureDuplicate);
console.log("\nSummary:");
console.log(`  Initial fixture FAIL: ${initialGood}/30`); console.log(`  Gold solution PASS:   ${goldGood}/30`); console.log(`  Test-cheat rejected:  ${cheatGood}/30`); console.log(`  Prompt leakage:       ${leaks.length}`); console.log(`  Duplicate prompts:    ${dupPrompts.length}`); console.log(`  Duplicate fixtures:   ${dupFixtures.length}`);
const ok=rows.length===30&&initialGood===30&&goldGood===30&&cheatGood===30&&!leaks.length&&!dupPrompts.length&&!dupFixtures.length;
console.log("\nRESULT:",ok?"PASS":"BLOCKED");
if(!ok){console.log("\nNeeds attention:"); for(const r of rows){const reasons=[]; if(r.initial!=="FAIL_OK") reasons.push(`initial=${r.initial}`); if(r.gold!=="PASS_OK") reasons.push(`gold=${r.gold}`); if(r.cheat!=="FAIL_OK") reasons.push(`cheat=${r.cheat}`); if(r.leakage.length) reasons.push(`leak=${r.leakage.join(",")}`); if(r.promptDuplicate) reasons.push("duplicate-prompt"); if(r.fixtureDuplicate) reasons.push("duplicate-fixture"); if(reasons.length) console.log(`  ${r.id}: ${reasons.join(" | ")}`);}}
process.exit(ok?0:1);
