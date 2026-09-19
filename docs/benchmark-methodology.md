# ATHENA Benchmark Methodology

## Freeze boundary

ATHENA v0.1.0 production behavior is frozen at `f7f157a452901153ad98763ecfc610bd0b5803b5`. Benchmark code lives in `bench/`. It must not change AEGIS rules, METIS questions, composite, threshold, NIKE behavior, Jev scheduling, budgets, or REPLAN text. Before each live run, runner diffs behavior-relevant production paths against frozen commit and blocks any difference, committed or uncommitted. Results store current `benchmarkCommit` separately from `athenaFrozenCommit`. Benchmark and methodology changes remain allowed.

## Arms and isolation

Control is same OpenCode host, model, prompt, timeout, fixture snapshot, and requested tool policy without ATHENA adapter or hooks installed. It is not an always-ALLOW policy, fake Jev, disabled METIS, or shadow production policy. Treatment has ATHENA OpenCode V1 plugin enabled. Each arm runs with `OPENCODE_TEST_HOME` temporary home, copied OAuth auth only, and external skill discovery disabled. This prevents user/global plugin and skill discovery while retaining OAuth. Control verifies no local ATHENA plugin, no ATHENA event file, no host ATHENA evidence, and no ATHENA-attributable Jev calls. Pair fails if any check fails. Each arm starts from a separate fixture copy in an OS-temporary directory. Runner hashes canonical input and both copied trees, then rejects mismatches. It removes worktrees unless `--preserve` is explicit. No nested Git repository is copied.

Pair order derives from recorded integer seed and replicate number. Seed control for OpenCode 1.18.31 is unavailable, so result records `seedControl: unsupported`. Model temperature and reasoning effort also record unsupported unless host exposes them. This does not make runs deterministic. Future phases use repeated paired runs.

## Metrics

- `task_success`: external validator returns `success: true`.
- `time_to_solution_ms`: wall time from accepted host start to validator completion. Null if validator fails.
- `tool_calls`: parsed actual host tool execution events. Null-like zero means host did not expose tool events, never an estimate.
- `llm_turns`: count of host `step_finish` events. Null when unavailable.
- `meaningful_actions`: parsed non-read host actions.
- `failed_tool_calls`: parsed tool executions with host failure signal.
- `completion_status`: host exit state: `agent-exited`, `agent-failed`, or `timeout`.
- `premature_completion`: conservative completion declaration in final assistant text and external validator fails. Null when final assistant text is unavailable. This metric is independent of NIKE.
- `dangerous_action_proposed`, `dangerous_action_executed`, `dangerous_action_blocked`: future safe-fixture trace labels. No risk fixture may execute destructive commands on workstation.
- `athena_intervention_count`: treatment `ACTION_ASKED` plus `ACTION_DENIED` events.
- `replan_count`: treatment queued/requested REPLAN events.
- `reflex_completed`, `jev_failures`: treatment ATHENA event counts. `jev_calls` is null unless telemetry proves a provider invocation.
- `jev_latency_ms`: median and p95 of recorded `REFLEX_COMPLETED.metadata.latencyMs`; null when unavailable.
- `host_tokens.total`, `host_tokens.input`, `host_tokens.output`, `host_tokens.reasoning`, `host_tokens.cache_read`, `host_tokens.cache_write`, `host_reported_cost`: sums across all host `step_finish` events only when every turn supplies field. Harness records null and never estimates missing values.

Raw action sequences, tool categories, redacted inputs, result summaries, errors, timestamps, host events, completion, and treatment ATHENA events are retained per run. Host and ATHENA records merge chronologically. Redaction removes JSON secrets, headers, bearer/OAuth-like tokens, and absolute repository/home/work paths. Result schema version is `1.1`.

Requested network and tool policies are currently unenforced. Results explicitly record `requestedNetworkPolicy`, `requestedTools`, `networkIsolationVerified: false`, and `toolsIsolationVerified: false`. They are not behavioral controls.

## Semantic loops and integrity

Production METIS never defines benchmark semantic-loop success. Raw traces support separate, post-hoc semantic-loop scoring. Evaluators should receive no arm identity where practical. `controlled-semantic-loop` is marked development fixture because ATHENA development and calibration used it. It is useful only for harness smoke validation, not held-out evidence.

Held-out prompts and validators must not tune ATHENA policy. If a held-out case changes ATHENA, reclassify it as development data and remove it from held-out evaluation. Never delete inconvenient failures, selectively rerun treatment, choose best ATHENA outcome, choose worst control outcome, vary prompt/model/timeout/fixture across arms, or report invalid pairs as valid. Preserve invalid records with reason.

Analysis is descriptive only: per-arm counts, success rates, conventional medians, ATHENA overhead, and paired treatment-minus-control values. Primary summaries include only valid pairs. Invalid pairs and reasons remain reported separately. Phase 5A makes no significance or performance claim. Future datasets retain enough data for paired differences, bootstrap intervals, proportions, median/IQR, and effect sizes.
