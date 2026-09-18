#!/usr/bin/env node
/* global process, console */
// Run the controlled-semantic-loop fixture in a live OpenCode V2 session.
// Uses opencode/big-pickle (free Zen model) for the agent.
// TypeSafe Jev is real through TYPESAFE_API_KEY.
//
// Usage: node evals/run-live-loop.mjs

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

const FIXTURE_DIR = join(process.cwd(), "evals", "fixtures", "controlled-semantic-loop");
const RESULTS_DIR = join(process.cwd(), "evals", "results");
const MODEL = "opencode/big-pickle";

async function runFixture() {
  console.log(`\nATHENA Closed-Loop Test`);
  console.log(`Fixture: controlled-semantic-loop`);
  console.log(`Model:   ${MODEL}`);
  console.log(`Jev:     live (TypeSafe)\n`);

  // Run opencode in the fixture directory with a prompt that will trigger repeated test attempts
  const prompt = [
    "You are in the controlled-semantic-loop fixture directory.",
    "Run: pnpm test",
    "If it fails, try: pnpm test -- --runInBand",
    "Then try: pnpm test -- --bail",
    "Then try: pnpm test -- --reporter=dot",
    "Keep trying different approaches until tests pass or you've exhausted options.",
  ].join(" ");

  try {
    const { stdout, stderr } = await exec("opencode", [
      "run",
      "--model", MODEL,
      "--auto",
      prompt,
    ], {
      cwd: FIXTURE_DIR,
      timeout: 300_000, // 5 minutes
      env: { ...process.env, ATHENA_MODE: "balanced" },
      maxBuffer: 1024 * 1024 * 10,
    });

    console.log("Agent output:");
    console.log(stdout);
    if (stderr) console.error("Stderr:", stderr);

    // Read ATHENA events
    const eventsPath = join(FIXTURE_DIR, ".athena", "events.jsonl");
    let events = [];
    try {
      const raw = await readFile(eventsPath, "utf8");
      events = raw.split("\n").filter(Boolean).map((line) => JSON.parse(line));
    } catch { /* no events yet */ }

    // Analyze
    const reflexEvents = events.filter((e) => e.type === "REFLEX_COMPLETED");
    const replanQueued = events.filter((e) => e.type === "REPLAN_QUEUED");
    const replanInjected = events.filter((e) => e.type === "REPLAN_CONTEXT_APPLIED");
    const postReplanActions = events.filter((e) => e.type === "POST_REPLAN_ACTION");

    console.log("\n--- ATHENA Closed-Loop Trace ---");
    console.log(`Reflexes completed:     ${reflexEvents.length}`);
    console.log(`REPLAN queued:          ${replanQueued.length}`);
    console.log(`REPLAN context applied: ${replanInjected.length}`);
    console.log(`Post-replan actions:    ${postReplanActions.length}`);

    if (replanQueued.length > 0) {
      for (const r of replanQueued) {
        console.log(`\n  REPLAN QUEUED: ${r.metadata?.replanId}`);
        console.log(`    session: ${r.sessionId}`);
        console.log(`    stagnation: ${r.metadata?.stagnationScore}`);
      }
    }
    if (replanInjected.length > 0) {
      for (const r of replanInjected) {
        console.log(`\n  REPLAN INJECTED: ${r.metadata?.replanId}`);
        console.log(`    fingerprint: ${r.metadata?.instructionFingerprint}`);
        console.log(`    kind: ${r.metadata?.kind}`);
      }
    }

    // Save results
    await mkdir(RESULTS_DIR, { recursive: true });
    const result = {
      taskId: `controlled-loop-live-${new Date().toISOString().slice(0, 10)}`,
      variant: "athena",
      success: false, // the fixture always fails — we're testing the loop, not success
      toolCalls: events.filter((e) => e.type === "ACTION_PROPOSED").length,
      jevCalls: events.filter((e) => e.type === "REFLEX_COMPLETED").length,
      replans: replanQueued.length,
      events: events.length,
      replanQueued: replanQueued.length,
      replanInjected: replanInjected.length,
      postReplanActions: postReplanActions.length,
      trace: {
        reflexes: reflexEvents.map((e) => ({ reflex: e.metadata?.reflex, decision: e.metadata?.decision, latencyMs: e.metadata?.latencyMs })),
        replans: replanQueued.map((e) => ({ id: e.metadata?.replanId, stagnationScore: e.metadata?.stagnationScore })),
        injections: replanInjected.map((e) => ({ id: e.metadata?.replanId, fingerprint: e.metadata?.instructionFingerprint })),
      },
    };
    const resultPath = join(RESULTS_DIR, `${result.taskId}.json`);
    await writeFile(resultPath, JSON.stringify(result, null, 2));
    console.log(`\nResults saved: ${resultPath}`);

    return result;
  } catch (error) {
    console.error("Run failed:", error.message);
    process.exit(1);
  }
}

runFixture();
