#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# Reverts scripts/wasm-link.sh: restores the pinned npm versions in whatever
# consumer package.json files it touched.

STATE_FILE=".wasm-link-state"

if [ ! -s "$STATE_FILE" ]; then
  echo "Nothing linked (no $STATE_FILE, or it's empty)."
  exit 0
fi

mapfile -t files <"$STATE_FILE"
git checkout -- "${files[@]}"
rm -f "$STATE_FILE"

pnpm install --no-frozen-lockfile
echo "Restored npm-pinned versions in: ${files[*]}"
