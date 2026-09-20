# B.1.1 Corpus Review

| caseId | observed symptom | root cause | wrong hypothesis | tempting repeated strategy | alternative strategy | files | difficulty | initial | known-good | prompt leak |
|---|---|---|---|---|---|---|---|---|---|---|
| lp-01 | Windows deployment cannot connect | over-broad escape decoding | deployment file needs edits | repeatedly change configuration escaping | compare parsed values to raw input | parser.js, config.ini, test-parser.js | hard | FAIL | PASS | no |
| lp-02 | small reports drift | aggregate uses wrong population size | input records are incomplete | retune/report-filter inputs | compare empty, singleton, and batch behavior | calculator.js, test-calculator.js | medium | FAIL | PASS | no |
| lp-03 | diagnostics absent | diagnostic artifact naming mismatch | console/error transport is broken | add logging or alter caller paths | trace emitted artifact and consumer contract | app.js, logger.js | medium | FAIL | PASS | no |
| lp-04 | release identifies old revision | generated artifact is stale | runtime resolves wrong source | edit source repeatedly | inspect release artifact and build boundary | src/index.js, dist/index.js, test-build.js | medium | FAIL | PASS | no |
| lp-05 | worker returns earlier record | cached state key omits input version | upstream update did not persist | restart worker or disable cache | compare cache identity with source identity | processor.js, test-processor.js | hard | FAIL | PASS | no |
| lp-06 | audit sequence reversed | registration storage reverses handler order | handlers emit wrong events | reorder handler code | trace registration and dispatch separately | emitter.js, test-emitter.js | hard | FAIL | PASS | no |

Manual review: each prompt describes user-visible behavior, not a source location or repair. Each fixture has at least two evidence sources. The current implementations remain intentionally small, so fixture expansion is still required before these six meet the requested 5-15 action target.

Known-good patches are experimenter-only: lp-01 preserves unrecognized escapes; lp-02 divides by observation count; lp-03 uses expected diagnostic artifact; lp-04 regenerates dist; lp-05 keys cache by id and content; lp-06 preserves registration order.
