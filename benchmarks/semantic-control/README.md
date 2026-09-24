# Semantic control benchmark

Preparation: `node benchmarks/semantic-control/src/generate-dataset.mjs`, `node benchmarks/semantic-control/src/validate.mjs`, then freeze from a clean committed tree with `node benchmarks/semantic-control/src/freeze.mjs`.

Real execution is deliberately quota-gated: `ATHENA_SEMANTIC_BENCHMARK_APPROVED=1 node benchmarks/semantic-control/src/run.mjs --execute`. It never prints credentials. The runner uses the real `TypeSafeSystem1Runtime`, current `CognitivePolicy`, and active `ToolRouter`; expected labels are never included in TypeSafe state.

Analysis is offline: `node benchmarks/semantic-control/src/analyze.mjs benchmarks/semantic-control/runs/<experiment-id>`.
