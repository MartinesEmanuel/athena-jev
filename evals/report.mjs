/* global process */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const directory = join(process.cwd(), "evals", "results");
const files = (await readdir(directory)).filter((file) => file.endsWith(".json"));
if (!files.length) { process.stdout.write("No measured evaluation results. Run live sessions and save redacted result JSON in evals/results/.\n"); process.exit(0); }
const rows = (await Promise.all(files.map(async (file) => JSON.parse(await readFile(join(directory, file), "utf8"))))).flat();
for (const row of rows) process.stdout.write(`${row.taskId}\t${row.variant}\tsuccess=${row.success}\ttoolCalls=${row.toolCalls}\tjevCalls=${row.jevCalls ?? "n/a"}\treplans=${row.replans ?? "n/a"}\n`);
