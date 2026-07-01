#!/bin/bash
set -euo pipefail

# Only run in Claude Code on the web / remote sandboxes. Local dev (Nix
# flakes) already handles toolchain + build setup differently.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

pnpm install

# Build every workspace package's dist/ output so lint/typecheck can resolve
# `some-ui-shared`, `some-ui-utils`, `some-ui-slideshow`, etc. via their
# package.json main/exports instead of hitting import/no-unresolved or
# TS2307 on a cold checkout.
#
# - `build:unsafe` (plain `turbo run build`) instead of `build`: the latter
#   wraps turbo in scripts/with-limits.sh, which shells out to
#   `systemd-run --user --scope` for memory limiting. There's no user D-Bus
#   session in this sandbox, so that fails outright ("Failed to connect to
#   bus: No medium found").
# - `--filter='!./crates/*'` excludes the Rust/wasm-bindgen crates
#   (leetype-wasm, some-crossword, viewport-rotation, polyhedron,
#   hangul-game-core, some-hexagon). They're built with wasm-pack, which
#   requires a Rust + wasm32 toolchain this sandbox doesn't have — trying to
#   build them here is a structural dead end, not something more retries fix.
# - `--continue=always`: packages/ui/input's own build still fails here even
#   with the wasm crates excluded from the graph, because its source
#   directly imports them (TS2307 — tracked separately as debt, not fixed by
#   this hook). Without --continue, that one failure aborts the whole turbo
#   run and leaves every other, unrelated package unbuilt too.
pnpm build:unsafe --filter='!./crates/*' --continue=always || true
