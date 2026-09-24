/* global process, console */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { bootstrap, mcnemar, paired } from "./lib.mjs";
const [runDir] = process.argv.slice(2); if (!runDir) throw Error("usage: analyze.mjs <run-dir>");
const records=(await readFile(join(runDir,"results.jsonl"),"utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
const p=paired(records); const summary={ trajectories:records.length, paired:p, pairedBootstrap95:bootstrap(p.rows,20260925), mcnemar:mcnemar(p.baselineOnly,p.athenaOnly), conditions:Object.fromEntries(["baseline","observe","cognitive","full"].map(c=>{const x=records.filter(r=>r.condition===c&&!r.outcome.infraFailure);return [c,{resolved:x.filter(r=>r.outcome.resolved).length,total:x.length,rate:x.length?x.filter(r=>r.outcome.resolved).length/x.length:null}]})) };
await writeFile(join(runDir,"summary.json"),JSON.stringify(summary,null,2));
await writeFile(join(runDir,"results.csv"),"task_id,condition,run_index,resolved,infra_failure,duration_ms\n"+records.map(r=>`${r.taskId},${r.condition},${r.runIndex},${r.outcome.resolved},${r.outcome.infraFailure},${r.agent.wallClockMs??""}`).join("\n"));
await writeFile(join(runDir,"paired.csv"),"task_run,baseline,athena\n"+p.rows.map(r=>`${r.id},${r.baseline},${r.athena}`).join("\n")); console.log(JSON.stringify(summary,null,2));
