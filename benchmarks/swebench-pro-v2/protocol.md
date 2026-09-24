# ATHENA SWE-Bench Pro V2 protocol

This harness evaluates the official ScaleAI V2 public release only. It is pinned to
`scaleapi/SWE-bench_Pro-os@66f92766bba642462d4bbe5479e83f91f9211862` (V2.0.0,
published 2026-09-22). The publisher specifies 642 Harbor tasks from 11 repositories.
The source checkout is used for task metadata and Harbor execution; `solution/` is never
mounted or supplied to an agent. The task image has a sanitised history.

## Locked protocol

The agent phase uses every task's `[agent] network_mode = "no-network"`; Harbor's
`--allow-agent-host` permits only the frozen model endpoint. WebFetch and WebSearch are
explicitly disabled. The agent writes `/logs/agent/model.patch`. The official
`patch_replay:PatchReplayAgent` then applies that patch in a new pristine task image and
runs the unchanged verifier. Only this replay result is the primary endpoint.

Conditions are frozen before execution: `baseline` has no ATHENA code/config/plugin;
`observe` has cognition/tool routing in observe modes but may not mutate system context or
the tool map; `cognitive` enables cognition only; `full` enables cognition and active
routing. A run refuses a baseline telemetry record showing interventions/pruning, and
refuses an observe record showing either. The runner does not alter ATHENA thresholds.

Infrastructure failures (Harbor/environment/provider failures before an attributable
trajectory) can be retried at most twice and are retained as separate JSONL events. All
agent timeouts, empty/bad patches, loops, blocks, and failed verifiers are outcomes and
are not retried. The full run requires `--confirm-live` and a frozen non-placeholder
model/provider configuration.

The local doctor is intentionally conservative: full execution is rejected below 64 GB
free disk or 16 GB available RAM. This protects the workstation; it does not change the
official benchmark.

## Confirmatory preregistration

The template `frozen-experiment.template.json` is the pre-execution protocol. Its primary
hypothesis is two-sided: H0 says ATHENA does not change paired resolution probability;
H1 says it changes it. The primary endpoint is the official replay verifier's Boolean
result. The primary analysis is exact two-sided McNemar plus a 10,000-resample paired
bootstrap (seed `20260925`) of the absolute resolve-rate difference. Task pairs, not arms,
are resampled. Rescues are baseline fail / full pass; regressions reverse that condition.

Stage 1 is all 642 tasks × baseline/full × one run. Stage 2 is an independently repeated,
condition-blind metadata-stratified subset with three runs per condition/task. Ablation
selection and all five conditions are frozen before any outcomes are inspected. Subgroups,
domain correlations, and ablations are exploratory unless separately preregistered.
