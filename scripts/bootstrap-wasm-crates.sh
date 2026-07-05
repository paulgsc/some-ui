#!/usr/bin/env bash
set -euo pipefail

# On-demand bootstrap for the Rust/wasm-bindgen crates under crates/.
#
# .claude/hooks/session-start.sh intentionally skips these
# (`pnpm build:unsafe --filter='!./crates/*'`) to keep session startup
# fast for sessions that never touch wasm code. Run this script by hand
# when a task actually depends on one of them (e.g. @some-ui/honeycomb
# depends on hangul-game-core, some-hexagon, and polyhedron).
#
# The toolchain to build these IS available in this sandbox — cargo and
# rustup are preinstalled. This script just fills the two gaps that trip
# up a cold build:
#
#   1. `wasm-pack` isn't installed by default.
#   2. The `wasm32-unknown-unknown` rustup target isn't installed by
#      default, and if you let turbo build multiple wasm crates in
#      parallel before it's present, they race to install it into the
#      shared rustup download cache and fail with:
#        "error: component download failed for rust-std-wasm32-unknown-unknown:
#         could not rename ... No such file or directory"
#      Installing the target once, serially, up front avoids that race.
#
# It also always passes `--no-opt` to wasm-pack. The default release
# build shells out to `wasm-opt` (binaryen), which tries to download a
# prebuilt binary directly from
# https://github.com/WebAssembly/binaryen/releases/download/... — that
# request gets a 403 from this environment's proxy (confirmed via plain
# curl; unrelated to the git-over-proxy path used for git operations,
# which works fine). There's no way around this short of `--no-opt`
# (or `wasm-opt = false` under `[package.metadata.wasm-pack.profile.release]`
# in the crate's Cargo.toml — but that's a source change, so prefer the
# flag over editing a crate you're not otherwise touching), so
# non-binaryen-optimized wasm output is what you get in this sandbox.
#
# Usage:
#   scripts/bootstrap-wasm-crates.sh                  # build every wasm crate
#   scripts/bootstrap-wasm-crates.sh hangul-game-core some-hexagon polyhedron
#
# After this, build the downstream JS/TS package directly via its own
# script (`pnpm --filter <pkg> build`), NOT via `turbo run build` for that
# filter — turbo has no cache entry for these crates on a fresh checkout,
# so it will re-run their un-flagged `wasm-pack` script and hit the same
# binaryen 403 again.

# Keep in sync with crates/*/package.json — these are the crates whose
# `build`/`wasm:prod` script invokes wasm-pack.
ALL_WASM_CRATES=(hangul-game-core leetype_wasm polyhedron some-crossword some-hexagon viewport-rotation)
CRATES=("${@:-${ALL_WASM_CRATES[@]}}")

export PATH="$HOME/.cargo/bin:$PATH"

if ! command -v wasm-pack >/dev/null 2>&1; then
  echo "Installing wasm-pack..."
  cargo install wasm-pack --locked
fi

if ! rustup target list --installed | grep -qx 'wasm32-unknown-unknown'; then
  echo "Adding wasm32-unknown-unknown rustup target..."
  rustup target add wasm32-unknown-unknown
fi

for crate in "${CRATES[@]}"; do
  dir="crates/$crate"
  if [ ! -d "$dir" ]; then
    echo "skip: $dir does not exist" >&2
    continue
  fi
  echo "Building $crate (wasm-pack --no-opt)..."
  (cd "$dir" && wasm-pack build --target web --release --out-dir dist --no-opt)
done
