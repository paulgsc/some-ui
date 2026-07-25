#!/usr/bin/env bash
set -euo pipefail

# CI guardrail for Axiom 11.1 in
# docs/canon/hangul-progression-canon.typ (§11.2):
# `#[wasm_bindgen]` may appear only in a crate's designated thin wrapper
# file. Every other file - in particular all pure game/typing logic - must
# stay free of any wasm-bindgen dependency, so it stays testable with plain
# `cargo test` and reusable outside a WASM host.
#
# Usage: scripts/check-wasm-bindgen-boundary.sh

cd "$(git rev-parse --show-toplevel)"

# crate directory -> its designated wrapper file, relative to the crate dir.
declare -A GUARDED_CRATES=(
  [crates/hangul-game-core]=src/lib.rs
  [crates/leetype_wasm]=src/lib.rs
)

status=0

for crate_dir in "${!GUARDED_CRATES[@]}"; do
  wrapper="$crate_dir/${GUARDED_CRATES[$crate_dir]}"

  if [ ! -f "$wrapper" ]; then
    echo "::error::designated wrapper $wrapper does not exist"
    status=1
    continue
  fi

  offenders=$(git grep -l --untracked "wasm_bindgen" -- "$crate_dir/src/*.rs" ":(exclude)$wrapper" || true)

  if [ -n "$offenders" ]; then
    echo "::error::wasm_bindgen must only appear in $wrapper, but was found in:"
    echo "$offenders"
    status=1
  fi
done

if [ "$status" -eq 0 ]; then
  echo "OK: wasm_bindgen is confined to each guarded crate's thin wrapper."
fi

exit "$status"
