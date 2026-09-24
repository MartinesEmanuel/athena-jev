#!/usr/bin/env bash
# Build a self-contained, model-free ATHENA runtime artifact for Harbor upload.
set -euo pipefail
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
out=${1:?usage: build-harbor-athena-bundle.sh <output.tgz>}
cd "$root"
pnpm install --frozen-lockfile
pnpm --filter @athena/core --filter @athena/typesafe --filter @athena/hud-protocol --filter @athena/opencode build
mkdir -p "$(dirname "$out")"
tar -C "$root" -chzf "$out" \
  node_modules \
  packages/core/package.json packages/core/dist \
  packages/typesafe/package.json packages/typesafe/dist \
  packages/hud-protocol/package.json packages/hud-protocol/dist \
  packages/opencode/package.json packages/opencode/dist
