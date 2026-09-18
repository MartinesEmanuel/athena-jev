#!/usr/bin/env sh
set -eu
# Pipe through VHS, asciinema, or terminal recorder. Demo provider is explicit.
node packages/cli/dist/index.js demo
