/* global process */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const fixtures = join(process.cwd(), "evals", "fixtures");
const names = await readdir(fixtures, { withFileTypes: true });
const scenarios = await Promise.all(names.filter((entry) => entry.isDirectory()).map(async (entry) => JSON.parse(await readFile(join(fixtures, entry.name, "scenario.json"), "utf8"))));
for (const scenario of scenarios) {
  process.stdout.write(`${JSON.stringify({ scenario: scenario.name, modes: ["baseline", "shadow", "balanced"], fixture: true, measured: false, note: "Harness fixture loaded. Run with a supported agent runner to produce measured result JSON." })}\n`);
}
