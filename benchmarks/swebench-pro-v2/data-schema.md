# Raw record schema

`results.jsonl` is append-only. A trajectory record includes identity, exact configuration
hash, timestamps, official grader artifact path/hash, authoritative `resolved`, a failure
taxonomy value (`MODEL_FAILURE`, `HOST_FAILURE`, `ATHENA_FAILURE`, `JEV_FAILURE`,
`GRADER_FAILURE`, `TIMEOUT`, `ENVIRONMENT_FAILURE`, `NETWORK_FAILURE`, `INVALID_TASK`,
or `UNKNOWN`), and sanitized telemetry. `telemetry.jsonl`, `grader.jsonl`,
`failures.jsonl`, and `discordant-pairs.jsonl` are also append-only.

Raw records must never include prompts beyond the public task instruction, provider chain of
thought, credentials, authorization headers, or API keys. Patches and grader output are
stored by path/hash and copied from the official locked agent/replay job.
