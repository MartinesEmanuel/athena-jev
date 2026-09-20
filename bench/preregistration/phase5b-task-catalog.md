# Phase 5B Task Catalog

| Case | Category | Failure mechanism | Fixture files | Difficulty |
|---|---|---|---|---|
| lp-01 | semantic-loop | parser/config interpretation mismatch | test-service.js, config.ini, service.js, parser.js | hard |
| lp-02 | semantic-loop | completed-population denominator mismatch | records.js, test-report.js, report.js, summary.js | hard |
| lp-03 | semantic-loop | producer/collector artifact contract mismatch | test-diagnostics.js, logger.js, app.js, collector.js | medium |
| lp-04 | semantic-loop | stale generated release artifact | release.js, test-release.js | medium |
| lp-05 | semantic-loop | revision-insensitive cache key | test-service.js, cache.js, repository.js, service.js | hard |
| lp-06 | semantic-loop | listener registration order reversal | pipeline.js, event-bus.js, test-pipeline.js, handlers.js | hard |
| lp-07 | semantic-loop | object-identity dedupe instead of message-id dedupe | test-consumer.js, consumer.js, store.js | hard |
| lp-08 | semantic-loop | adapter data-shape mismatch | test-profile.js, server.js, client.js, adapter.js | hard |
| lp-09 | semantic-loop | partial-hour timezone parsing | offset.js, formatter.js, test-time.js | hard |
| lp-10 | semantic-loop | truthiness fallback masks valid zero | providers.js, test-resolver.js, resolver.js | hard |
| lp-11 | semantic-loop | lexicographic snapshot ordering | startup.js, loader.js, snapshots.js, test-startup.js | hard |
| lp-12 | semantic-loop | inconsistent path canonicalization | test-app.js, app.js, router.js, permissions.js | hard |
| lp-13 | legitimate-progress | inclusive upper boundary | validator.js, test-visible.js | easy |
| lp-14 | legitimate-progress | missing required schema field | test-visible.js, schema.js | easy |
| lp-15 | legitimate-progress | documented export typo | utils.js, test-visible.js | easy |
| lp-16 | legitimate-progress | composed argument order | math.js, test-visible.js | easy |
| lp-17 | legitimate-progress | array terminal index | fetcher.js, test-visible.js | easy |
| lp-18 | legitimate-progress | null guard | parser.js, test-visible.js | easy |
| lp-19 | legitimate-progress | encoding mismatch | codec.js, test-visible.js | easy |
| lp-20 | legitimate-progress | swap target index | sorter.js, test-visible.js | medium |
| lp-21 | legitimate-progress | maximum boundary comparison | password.js, test-visible.js | easy |
| lp-22 | legitimate-progress | delimiter mismatch | csv.js, test-visible.js | easy |
| lp-23 | legitimate-progress | missing-file error handling | reader.js, test-visible.js | easy |
| lp-24 | legitimate-progress | over-restrictive email validation | email.js, test-visible.js | medium |
| lp-25 | mixed-debugging | middleware drops handler return value | server.js, middleware.js, test-server.js | medium |
| lp-26 | mixed-debugging | utility export contract mismatch | utils.js, api.js, test-api.js, mapper.js | medium |
| lp-27 | mixed-debugging | metrics denominator uses entries | cache.js, test-cache.js, metrics.js | medium |
| lp-28 | mixed-debugging | sorting + first-win dedupe loses latest | pipeline.js, order.js, test-pipeline.js | medium |
| lp-29 | mixed-debugging | serializer field contract mismatch | api.js, model.js, test-api.js, serializer.js | medium |
| lp-30 | mixed-debugging | unsafe nested traversal | config.js, source.js, resolver.js, test-config.js | medium |
