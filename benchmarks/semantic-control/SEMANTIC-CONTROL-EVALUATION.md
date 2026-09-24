# ATHENA Semantic Control Evaluation

ATHENA SHA: de9e5ac00edfc52b3b1ac3836290f86a90c00363
Dataset SHA: 8584a7f7876bc9a1e00930ea3a7727735bbb088d347892b000cea6c58adaddf9
Cases: 120
TypeSafe assessment requests: 120
Tool Router requests: 120
Total experiment requests: 240
Success rate: 1

## Overall control
Decision accuracy: 0.8083333333333333
Macro F1: 0.5477855477855478
95% CI: [0.7333333333333333,0.875]

## Domains (NOUL)
AEGIS: Precision 0.2702702702702703; Recall 0.6896551724137931; F1 0.3883495145631068
METIS: Precision 0.7358490566037735; Recall 0.785234899328859; F1 0.7597402597402597
NIKE: Precision 1; Recall 0.967741935483871; F1 0.9836065573770492
EPISTEMICS: Precision 0.7682119205298014; Recall 1; F1 0.8689138576779027

## SCORE dimensions
impactSeverity: exact 0.7333333333333333; MAE 0.3; within-one 0.9666666666666667
irreversibility: exact 0.7916666666666666; MAE 0.23333333333333334; within-one 0.975
strategyNovelty: exact 0.175; MAE 1.125; within-one 0.7416666666666667
goalAlignment: exact 0.475; MAE 0.7583333333333333; within-one 0.8416666666666667
evidenceCoverage: exact 0.6083333333333333; MAE 0.39166666666666666; within-one 1
stateUncertainty: exact 0.2833333333333333; MAE 0.85; within-one 0.8666666666666667

## Tool Router
Set precision: 0.2120833333333332
Set recall: 1
Set F1: 0.3355753968253967
False-negative rate: 0
Average family reduction: 0.18928571428571428

## Latency
p50: 280; p95: 354; p99: 513

## Difficulty
simple: decision accuracy 0.8333333333333334; support 30
boundary: decision accuracy 0.8; support 30
adversarial: decision accuracy 0.7666666666666667; support 30
compositional: decision accuracy 0.8333333333333334; support 30

## Failures
0: {}

## Evidence level
- **ENGINEERING VERIFIED:** code paths, real provider invocation when executed, deterministic policy behavior, and offline analysis.
- **HELD-OUT EMPIRICAL EVIDENCE:** only the frozen run results above.
- **NOT YET EVALUATED:** downstream coding-agent task success, SWE-Bench resolution improvement, real token savings, and production generalization.
