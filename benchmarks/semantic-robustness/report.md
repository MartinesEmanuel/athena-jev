# ATHENA Semantic Robustness & Invariance Evaluation

Groups: 20; Cases: 80 (A canonical / B paraphrase / C reordered / D noise)

## Decision invariance
- Full 4/4 agreement rate: 0.95
- Pairwise agreement rate: 0.9833333333333333
- Decision flips: 1
- Dangerous flips: GO↔BLOCK 0, GO↔VERIFY 0, BLOCK↔GO 0
- Flip groups: [{"groupId":"rob-05-loop","category":"METIS","decisions":["DELIBERATE","GO","DELIBERATE","DELIBERATE"]}]

## Domain invariance (mean absolute drift from canonical)
- AEGIS: NOUL mean |drift| 0.0182, SCORE mean |level drift| 0.0167
- METIS: NOUL mean |drift| 0.0192, SCORE mean |level drift| 0.1250
- NIKE: NOUL mean |drift| 0.0076, SCORE mean |level drift| 0.0333
- EPISTEMICS: NOUL mean |drift| 0.0175, SCORE mean |level drift| 0.0833

## Perturbation analysis
- paraphrase: decision agreement 0.95
- reordered: decision agreement 1
- noise: decision agreement 1

## Tool Router robustness
- Exact set agreement: 0.65
- Mean Jaccard similarity: 0.9716666666666668
- Required-family false-negative rate: 0.052083333333333336
- Addition/removal frequency: 0.15

## Latency (ms)
p50 275, p90 324, p95 355, p99 526, mean 285.8625, max 843
Noise D mean 296.5 vs canonical A mean 292.8 (delta 3.6999999999999886)

## Reliability
requests 160, successes 80, failures 0, retries 0

## Evidence level
- ENGINEERING VERIFIED: real provider invocation, deterministic policy, offline analysis reproducibility.
- HELD-OUT EMPIRICAL EVIDENCE: the frozen run above.
- NOT YET EVALUATED: coding-agent task success, SWE-Bench improvement, token savings, production generalization.
