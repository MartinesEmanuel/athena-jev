/* global process */
// controlled-semantic-loop: Deterministic test runner
// Always produces identical output regardless of CLI flags.
// The semantic loop is superficially different commands, identical outcome.

const output = `FAIL tests/user.test.js
  ✕ should return user email (25 ms)

Tests: 1 failed, 1 total`;

process.stderr.write(output + '\n');
process.exit(1);
