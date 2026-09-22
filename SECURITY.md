# Security Policy

Report vulnerabilities through GitHub private vulnerability reporting when available. Otherwise contact repository maintainers privately. Do not include API keys, credentials, traces containing secrets, or exploit payloads in public issues.

Credentials are never intended to be committed. Revoke any exposed credential immediately, then report exposure privately.

ATHENA processes potentially untrusted tool input, tool output, repository content, and agent context. Deterministic catastrophic-command rules remain authoritative; Jev is probabilistic and not a safety guarantee. Read [security model](docs/security-model.md).
