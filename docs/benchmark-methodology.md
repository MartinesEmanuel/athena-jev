# ATHENA Benchmark Methodology

## Freeze boundary

ATHENA v0.1.0 production behavior is frozen at `f7f157a452901153ad98763ecfc610bd0b5803b5`. Benchmark code lives in `bench/`. It must not change AEGIS rules, METIS questions, composite, threshold, NIKE behavior, Jev scheduling, budgets, or REPLAN text. Before each live run, runner diffs behavior-relevant production paths against frozen commit and blocks any difference, committed or uncommitted. Results store current `benchmarkCommit` separately from `athenaFrozenCommit`. Benchmark and methodology changes remain allowed.

## Frozen Production Runtime

Treatment source materializes directly from frozen Git commit `f7f157a452901153ad98763ecfc610bd0b5803b5` into an OS-temporary cache. Runner installs dependencies and builds `@athena/core`, `@athena/typesafe`, and `@athena/opencode` there. It assembles isolated runtime artifacts and resolves all internal ATHENA dependencies from that artifact root before any agent execution. Current working-tree `packages/opencode/dist/index.js` is never a treatment runtime source.

Runner fingerprints sorted relative paths and contents of each runtime package `package.json` and `dist` files with SHA-256. It records frozen commit, fingerprint, `buildSource: "git-commit"`, and sanitized logical artifact root in manifest, treatment result, and pair metadata. Cache key includes frozen commit, Node major version, and frozen lockfile fingerprint. Reuse requires completion marker, matching fingerprint, and dependency graph validation; otherwise runner rebuilds or stops with benchmark-infrastructure error. Benchmark harness may evolve independently, but this mechanism only proves treatment runtime provenance described here.

## Three-root architecture

Benchmark execution uses five distinct filesystem roots:

1. **Workspace root (model-visible)**: Task fixture files only. Agent-visible. No `.athena/` or `.opencode/` directories. Fingerprinted for model-visible input equality between arms. `fingerprintFixture` uses `files()` which excludes `.git`, `.athena`, `.opencode`, and `node_modules` from hashing.
2. **Host config root (`OPENCODE_CONFIG_DIR`)**: Contains `.opencode/plugins/athena.ts` (treatment only) and `opencode.json` with tool permission policy. Control gets `opencode.json` but no plugin. Agent cannot see this directory.
3. **ATHENA state root**: Hidden from model. Treatment wrapper redirects `context.directory` here for config reads and event writes. Ensures `.athena/events.jsonl` never appears in model workspace. Control gets no state root content.
4. **Probe root**: Used for network isolation probing. Isolated from both workspace and host config.
5. **Scrubbed home**: Empty benchmark-owned directory. Agent shell `HOME` is set here. Unsets `TYPESAFE_API_KEY`, `ATHENA_BENCH_PLUGIN_PROBE`, `OPENCODE_CONFIG`, and `OPENCODE_CONFIG_DIR` from agent environment.

Control arm receives no `.opencode/plugins/` and no `.athena/` in either workspace or host config root.

Phase 5B treatment config is frozen infrastructure at `bench/runners/phase5b-athena-config.json`. It duplicates existing balanced TypeSafe benchmark config, not task-fixture content. `prepareArm` writes it only to treatment state root. Missing or malformed canonical config stops setup with `BenchmarkInfrastructureError`.

## Harness Identity

Each experiment fingerprints SHA-256 over sorted relative paths and contents of `.mjs` and `.json` files in `bench/runners`, `bench/validators`, `bench/schema`, and `bench/analysis`. These paths contain experiment planning, execution, host parsing, arm wiring, result validation, pair validation, and analysis. It excludes `bench/results`, Markdown, README files, documentation, temporary files, and captured run output. Manifest, every result, and pair validation record this fingerprint. Resume rejects missing or changed harness identity.

## Phase 5B V1 aborted launch

`phase5b-freeze-v1` launch attempt aborted before first scientific agent execution. Treatment `prepareArm` incorrectly read `.athena/config.json` from held-out fixture `lp-22`; held-out fixtures are task inputs and contain no benchmark-control config. Only `bench/results/phase5b-held-out/manifest.json` was created. No run result artifacts, GPT held-out calls, Jev held-out calls, or scientific observations were produced. This attempt is not a replicate.

## Arms and isolation

Control is same OpenCode host, model, prompt, timeout, fixture snapshot, and requested tool policy without ATHENA adapter or hooks installed. It is not an always-ALLOW policy, fake Jev, disabled METIS, or shadow production policy. Treatment has ATHENA OpenCode V1 plugin enabled. Each arm gets per-run `host-home` and `shell-home` roots. `host-home` receives only copied OpenCode OAuth auth and is passed to OpenCode as `HOME` and `OPENCODE_TEST_HOME`; `shell-home` is used only by agent shell commands. Agent shell wrapper removes `TYPESAFE_API_KEY`, `ATHENA_BENCH_PLUGIN_PROBE`, `OPENCODE_CONFIG`, and `OPENCODE_CONFIG_DIR`, while host retains provider credentials. External skill discovery is disabled. This prevents user/global plugin and skill discovery. Control absence is established by no local ATHENA plugin, no ATHENA event file, no host ATHENA evidence, and isolated host configuration. Provider calls remain unknown when provider telemetry is unavailable. Each arm starts from a separate fixture copy in an OS-temporary directory. Runner hashes canonical input and both copied trees, then rejects mismatches.

## Model-visible input fingerprint

Runner computes `modelVisibleInputFingerprint` by walking the entire model workspace tree with no exclusions. Every file path and content is SHA-256 hashed in deterministic (sorted) order. This ensures model-visible input is identical between control and treatment arms. Pair validation rejects runs where fingerprints differ.

## OpenCode config generation

`generateOpenCodeConfig(requestedTools)` accepts an array of tool categories (`["read"]`, `["shell"]`, `["write"]`) and produces an `opencode.json` content object with a `permission` map. Category mapping:

- `read`: read, glob, grep
- `write`: edit
- `shell`: bash

Default deny entries: `external_directory`, `task`, `skill`, `lsp`, `question`, `webfetch`, `websearch`. Tools not in the permission map are implicitly denied by OpenCode. `prepareArm` writes this config to `hostConfigRoot/opencode.json` before execution.

## Tool isolation

Tool permission policy is generated from `requestedTools` categories and written as `opencode.json` with `permission` field (singular). The config maps requested tool categories to OpenCode permission entries. `toolsIsolationVerified` is true when all observed tools during execution are present in the allowed set. `outOfPolicyObservedTools` lists any tools the agent used that were not in the policy.

## Network and shell isolation

For cases with `requestedNetworkPolicy: "offline"`, the benchmark uses Docker with `--network none` to create an isolated shell environment. A shell wrapper script runs agent bash commands inside a Docker container with:

- `--network none`: no network access
- `--rm`: ephemeral container per command
- `--user 1000:1000`: non-root execution
- `--read-only`: read-only root filesystem
- `--tmpfs /tmp:rw,noexec,nosuid`: writable temp
- Bind mount of workspace only

The same Docker image (`athena-bench-shell:latest`) is used for both control and treatment arms. The image contains bash, node (for probes), and coreutils. Image reference and digest are recorded in `shellIsolation` evidence.

Verification runs seven real probes through the Docker wrapper:

1. **Local probe**: `printf ok` must succeed.
2. **Workspace read**: fixture file readable.
3. **Workspace write**: temporary file writable in workspace.
4. **Network probe**: socket connection attempt must fail (`BLOCKED`).
5. **Hidden state**: `hostConfigRoot`, `athenaStateRoot`, `probeRoot` must be unreadable.
6. **Secret scrub**: `TYPESAFE_API_KEY` must be absent from container environment.
7. **Docker socket**: `/var/run/docker.sock` must not be mounted.

`networkIsolationVerified` is true only when all probes pass. `shellIsolation.verified` records the same. When Docker is unavailable, the benchmark blocks live execution with a benchmark-infrastructure error.

## Stagnation decision audit

Each treatment run includes an `environmentMetadata.stagnationDecisionAudit` array. For each `REFLEX_COMPLETED` event with `reflex: "stagnation"` in the ATHENA event trace, the benchmark reconstructs the decision using frozen core functions:

1. Extract `metadata.scores` (the `StagnationReflex` with 6 probability fields).
2. Call `coreModule.stagnationScore(scores)` to compute the composite score.
3. Call `coreModule.hasStagnationEvidence(scores)` to count evidence signals (6 conditions checked, >= 4 needed).
4. Check `newInformationGate`: `scores.newInformation <= 0.45`.
5. Call `coreModule.decide(athenaConfig, { action: BENIGN_ACTION, stagnation: scores })` where `BENIGN_ACTION` is `{ id: "audit-benign", tool: "read", input: "audit probe", readOnly: true, timestamp: <event-time> }`.
6. Scan subsequent events for `REPLAN_REQUESTED` and `REPLAN_QUEUED` from the same session to determine observed replan.
7. Compute `policyMatchesObserved`: whether the frozen decision agrees with observed replan behavior.

Each audit entry records: `timestamp`, `scores`, `compositeScore` (rounded to 4 decimals), `effectiveThreshold`, `gates` (scoreThresholdPassed, newInformationGatePassed, evidenceSignalCount, multiSignalEvidencePassed), `frozenPolicy` (decision, reason, shadow), `observed` (replanRequested, replanQueued), and `policyMatchesObserved`.

Per-evaluation audit replaces the previous per-run aggregate. Pair validation checks that `policyMatchesObserved` is true for every audit entry.

## Metrics

- `taskSuccess`: external validator returns `success: true`.
- `durationMs`: wall time from start to finish.
- `toolCalls`: parsed actual host tool execution events.
- `llmTurns`: count of host step events.
- `failedToolCalls`: parsed tool executions with host failure signal.
- `termination`: `{ timedOut, terminationSignal, forcedKill }`.
- `metrics.prematureCompletion`: conservative completion declaration in final assistant text and external validator fails. Null when unavailable.

Raw action sequences, tool categories, redacted inputs, result summaries, errors, timestamps, host events, completion, and treatment ATHENA events are retained per run. Host and ATHENA records merge chronologically. Redaction removes JSON secrets, headers, bearer/OAuth-like tokens, and absolute repository/home/work paths. Result schema version is `1.2`.

### Schema 1.2 required fields

Schema 1.2 adds five required fields over 1.1:

- `modelVisibleEnvironment`: `{ fingerprint, athenaArtifactsPresent, benchmarkArtifactsPresent, verifiedEquivalentInput }` - proves no ATHENA artifacts leaked into model workspace.
- `toolIsolation`: `{ requestedTools, allowedHostTools, deniedHostTools, policyConfigFingerprint, observedTools, outOfPolicyObservedTools, verified }` - real permission JSON and observed tool verification.
- `networkIsolation`: `{ requestedPolicy, mechanism, wrapperFingerprint, localProbePassed, networkProbeBlocked, usableExternalRoutePresent, verified }` - real Docker-based isolation with probe results.
- `shellIsolation`: `{ backend, image, imageId, networkMode, workspaceMounted, dockerSocketMounted, localProbePassed, workspaceReadPassed, workspaceWritePassed, networkProbeBlocked, hiddenStateProbePassed, secretScrubProbePassed, verified, wrapperFingerprint }` - Docker sandbox evidence with real zero-model probes.
- `stagnationDecisionAudit`: array of per-evaluation frozen core audit entries (see above).

## Version-aware analysis

`validateResultForAnalysis(result)` dispatches by `schemaVersion`: routes `"1.1"` to `validateHistoricalResultV11` (requires environmentMetadata with required fields but not modelVisibleEnvironment) and `"1.2"` to `validateResult` (requires all 1.2 fields). Unsupported versions fail. Analysis may proceed with mixed-version result sets as long as each result passes its version-specific validator.

`validateHistoricalResultV11` accepts 1.1 results that have `environmentMetadata` with `requestedNetworkPolicy`, `networkIsolationVerified`, `requestedTools`, `toolsIsolationVerified`, `orderSeed`, `order`, and `modelVisibleInputFingerprint`. It does not require `modelVisibleEnvironment`, `toolIsolation`, `networkIsolation`, `shellIsolation`, or `stagnationDecisionAudit` fields.

`resumeCompatibility` compares stored and current execution identities, including `schemaVersion`. Schema 1.1 artifacts remain analyzable through `validateResultForAnalysis`, but never resume into a schema 1.2 execution. Existing runs are validated with the current 1.2 validator before reuse.

## Semantic loops and integrity

Production METIS never defines benchmark semantic-loop success. Raw traces support separate, post-hoc semantic-loop scoring. Evaluators should receive no arm identity where practical. `controlled-semantic-loop` is marked development fixture because ATHENA development and calibration used it. It is useful only for harness smoke validation, not held-out evidence.

Held-out prompts and validators must not tune ATHENA policy. If a held-out case changes ATHENA, reclassify it as development data and remove it from held-out evaluation. Never delete inconvenient failures, selectively rerun treatment, choose best ATHENA outcome, choose worst control outcome, vary prompt/model/timeout/fixture across arms, or report invalid pairs as valid. Preserve invalid records with reason.

Analysis is descriptive only: per-arm counts, success rates, conventional medians, ATHENA overhead, and paired treatment-minus-control values. Primary summaries include only valid pairs. Invalid pairs and reasons remain reported separately. Phase 5A makes no significance or performance claim. Future datasets retain enough data for paired differences, bootstrap intervals, proportions, median/IQR, and effect sizes.
