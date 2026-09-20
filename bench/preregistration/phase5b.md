# ATHENA Phase 5B Held-Out Evaluation

## Research Questions

1. Does ATHENA increase successful task completion rate compared with CONTROL?
2. Does ATHENA reduce persistent semantic-loop behavior on loop-prone tasks?
3. Does ATHENA change host-token consumption relative to CONTROL?
4. On legitimate-progress tasks, does ATHENA avoid unnecessary replans?

## Hypotheses

### Confirmatory (H1, H2)

- **H1**: ATHENA changes task success rate on held-out tasks.
- **H2**: ATHENA reduces persistent semantic-loop incidence on loop-prone tasks.

### Secondary (H3, H4)

- **H3**: Host-token usage differs between ATHENA and CONTROL.
- **H4**: ATHENA avoids unnecessary replans on legitimate-progress traces.

Additional secondary outcomes: duration, tool calls, LLM turns.

## Frozen System Versions

- Frozen ATHENA commit: `f7f157a452901153ad98763ecfc610bd0b5803b5`
- Benchmark commit: `c8b294e56c36d39042fd2b7a89009bca9e8bb4ea`
- R3 benchmark harness fingerprint: `518935b9504b1ca26474e96b402df8b8cfb2db8b8b8c9a220fcc5239309ea008`
- OpenCode version: 1.18.31
- Model: `openai/gpt-5.6-terra`
- Docker image: `athena-bench-shell:latest`
- Docker image ID: `sha256:53c63250fce11b423bcfaaff06378cd115b37c8974bc9c9d8839d144ff36c098`
- Timeout: 300000 ms

## Corpus

- 30 held-out tasks
- 12 semantic-loop
- 12 legitimate-progress
- 6 mixed-debugging
- All offline, JavaScript/Node.js
- Heldout corpus fingerprint: see `phase5b-corpus.json`

## Experimental Design

- 30 tasks x 3 replicates = 90 pairs
- Each pair: CONTROL + TREATMENT
- Total: 180 agent runs
- Arm order counterbalanced: 45 CT, 45 TC

## Randomization

- Deterministic seeded assignment
- Seed: 42
- Shuffle: seeded linear congruential generator
- Pair identities: `phase5b-<case>-r01` through `phase5b-<case>-r03`
- Arm orders use seeded permuted blocks of six: each block has three CONTROL then TREATMENT and three TREATMENT then CONTROL pairs.
- Frozen sequencing diagnostics: 54 CT/TC transitions, longest same-order streak 5

## Primary Outcomes

### H1: Task Success

- Metric: externally validated `taskSuccess`
- Experimental unit for generalization: TASK
- Replicates are clustered within task and are not treated as independent tasks
- For each task, compute CONTROL and TREATMENT success rates over available valid matched replicates
- Task effect: TREATMENT success rate minus CONTROL success rate
- Overall effect: unweighted mean of the task effects across held-out tasks
- Report: percentage-point effect, task-clustered 95% bootstrap CI, sample sizes
- Confirmatory test: two-sided paired sign-flip test on task-level effects
- Sign-flip procedure: exact when there are <=20 task effects; otherwise 100,000 deterministic Monte Carlo sign flips with seed 42

### H2: Loop Persistence

- Scope: the 12 pre-registered semantic-loop tasks
- Ground truth: blinded, independently adjudicated trace windows; METIS is never ground truth
- Run-level persistent-loop incidence: 1 if at least one adjudicated window is `LOOP`; 0 if at least one adjudicated window is `PROGRESS` and none is `LOOP`; otherwise missing/uncertain
- Replicate-pair effect: TREATMENT run incidence minus CONTROL run incidence
- Task effect: mean replicate-pair effect within task
- Overall effect: unweighted mean of task effects; negative values favor ATHENA
- Report both treatment-minus-control incidence delta and the sign-reversed reduction
- Confirmatory test: two-sided paired sign-flip test on task-level effects
- With 12 tasks the pre-registered sign-flip test is exact
- 95% CI: 10,000 task-clustered bootstrap resamples, seed 42

## Secondary Outcomes

### H3: Token Efficiency

- Metric: `hostTokens.total` (also preserve input, output, reasoning, cacheRead, cacheWrite separately)
- Include valid matched replicate pairs regardless of task success when positive token totals are available
- Replicate effect: `log(TREATMENT / CONTROL)`
- Cluster replicates within task; compute each task's mean log ratio first
- Overall estimand: unweighted mean of task mean log ratios
- Report geometric mean ratio, percent change, task-clustered 95% bootstrap CI, median raw paired token delta, sample sizes, and every missing/nonpositive pair
- Bootstrap: 10,000 TASK resamples, seed 42
- Do NOT assume direction

### H4: Non-Interference

- Scope: TREATMENT runs from the 12 legitimate-progress tasks
- A replan is not automatically unnecessary because task category is legitimate-progress
- Every injected replan links to its immediately preceding blinded behavior window
- Blind labels: `LOOP`, `PROGRESS`, `UNCERTAIN`
- Only adjudicated `PROGRESS` makes preceding replan unnecessary; `LOOP` can justify it; `UNCERTAIN` is not classified
- Primary descriptive event rate: unnecessary / (unnecessary + justified) among adjudicated injected replans
- Also report unnecessary replans per legitimate-progress TREATMENT run
- Report injected, justified, unnecessary, uncertain, and unlabeled counts explicitly
- If no replans are injected, event-rate denominator is zero (report N/A) and unnecessary-replans-per-run is 0

### Additional

- Duration (paired, task-clustered)
- Tool calls (descriptive)
- LLM turns (descriptive)

## Loop Annotation Protocol

### Blind Export

After all held-out runs complete:
1. Take sanitized host traces
2. Remove: arm identity, ATHENA events, provider events, REPLAN labels, directory names, session identifiers
3. Assign deterministic opaque annotation IDs (`A0001`, `A0002`, ...)
4. Create trace windows around repeated tool/action sequences

### Annotation Question

"At this point, is the agent persistently repeating the same underlying strategy without enough new information to justify continuation?"

### Labels

- LOOP
- PROGRESS
- UNCERTAIN

### Rubric

Consider:
- Same underlying strategy
- Same underlying problem
- Superficial variation
- New information acquired
- Material strategy changes

### Quality

- Preferred: 2 independent blinded human annotators
- Agreement: Cohen's kappa
- Disagreements: adjudicate without revealing arm
- Single-annotator limitation reported explicitly

## Baseline Loop Detector

Pre-registered heuristic:
- Same tool family + sufficiently similar normalized action repeated N times without successful state change
- Parameters: windowSize=5, similarityThreshold=0.8
- Implementation: `bench/analysis/baselines/repetition-detector.mjs`
- Not tuned after seeing labels/results

## Statistical Analysis

### H1 / H2 (Confirmatory)

- Unit of generalization: TASK
- Replicates remain clustered inside task
- Task-clustered bootstrap: 10,000 resamples, seed 42
- Paired sign-flip tests use task-level effects, two-sided
- Exact sign-flip when task count <=20; otherwise 100,000 Monte Carlo sign flips, seed 42
- H1 and H2 raw p-values receive Holm family-wise correction at alpha 0.05
- No confirmatory Holm result is final until both H1 and H2 are available

### H3 (Secondary)

- Bootstrap clustered by task
- Geometric mean ratio
- Report effect size, 95% CI, sample size

### General

- Effect size + 95% CI + sample size for every result
- p-values alone insufficient
- p > 0.05 does not prove no effect

## Missing Data

- Never silently drop missing/invalid data
- Report planned, observed, failed, timed-out, infrastructure-invalid, incomplete, and metric-missing observations
- Task failures and timeouts remain experimental data when their result artifact is valid
- Infrastructure-invalid runs are not converted into task failures
- H1 requires a boolean externally validated `taskSuccess` for both arms of a matched replicate
- H2 excludes only replicate pairs whose blind loop label is missing/uncertain in either arm, and reports every exclusion
- H3 excludes only matched pairs with missing/nonpositive token totals from the log-ratio estimand, and reports every exclusion
- Do not impute success, loop labels, tokens, or replan labels

## Infrastructure Failures

- Task failure != infrastructure failure
- Infrastructure examples: OpenCode crash, Docker unavailable, auth unavailable, validator crash, sandbox verification failure, fingerprint mismatch
- Task failures remain data
- Infrastructure-invalid runs may be rerun only if original artifact preserved, reason documented, replacement gets new attempt ID

## Retry Policy

- NO automatic retries of completed task failures
- Infrastructure-invalid runs: rerun ONLY with original artifact preserved
- No original artifact may be overwritten

## Stopping Rules

- Run full pre-registered corpus unless infrastructure safety requires stopping
- No early stopping because results look good
- If critical harness bug discovered: STOP, document, do not quietly patch

## Multiple Testing

- H1 and H2: confirmatory, family-wise alpha 0.05, Holm correction
- H3, H4, duration, tool calls, LLM turns: secondary, labeled as such
- Never retroactively promote secondary to primary

## Claim Language

Report ONLY:
- "On the pre-registered Phase 5B held-out benchmark..."
- Never: "ATHENA universally improves coding agents"
- If statistically supported: task-success delta, persistent-loop-rate delta, host-token delta, false-REPLAN rate with uncertainty

## Deviations From Protocol

`phase5b-freeze-v1` launch attempt aborted before first scientific agent execution because treatment `prepareArm` required `.athena/config.json` from held-out fixture `lp-22`. Only experiment manifest was created. No run result artifacts, GPT held-out calls, Jev held-out calls, or scientific observations were produced. This attempt is not a replicate. Phase 5B V2 moves exact existing balanced TypeSafe benchmark configuration into benchmark infrastructure and requires zero-model preflight of all planned pairs before collection.
