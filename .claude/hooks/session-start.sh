#!/bin/bash
set -euo pipefail

# Only run in Claude Code on the web / remote sandboxes. Local dev (Nix
# flakes) already handles toolchain + build setup differently.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

pnpm install

# Build every workspace package's dist/ output so lint/typecheck can resolve
# `@some-ui/shared`, `some-ui-utils`, `some-ui-slideshow`, etc. via their
# package.json main/exports instead of hitting import/no-unresolved or
# TS2307 on a cold checkout.
#
# - `build:unsafe` instead of `build`: the latter wraps turbo in
#   scripts/with-limits.sh, which shells out to `systemd-run --user --scope`
#   for memory limiting. There's no user D-Bus session in this sandbox, so
#   that fails outright ("Failed to connect to bus: No medium found").
#   Both scripts now carry `--filter='!./crates/*'`, so the only difference
#   between them is the resource-limit wrapper.
# - The crates filter lives in the root package.json rather than here. The
#   Rust/wasm-bindgen crates (leetype-wasm, some-crossword,
#   viewport-rotation, polyhedron, hangul-game-core, some-hexagon) are
#   consumed from the npm registry by every workspace that needs them, so
#   nothing in a normal build depends on crates/*/dist. Building them
#   requires wasm-pack, the wasm32-unknown-unknown target and wasm-opt's
#   binaryen download (see scripts/bootstrap-wasm-crates.sh) and costs ~4min
#   of cargo compilation. When a task genuinely needs a locally built crate,
#   ask for it declaratively with `pnpm build:crates` (or run
#   `scripts/bootstrap-wasm-crates.sh` first on a cold sandbox).
# - `--continue=always`: packages/ui/input's own build still fails here even
#   with the wasm crates excluded from the graph, because its source
#   directly imports them (TS2307 — tracked separately as debt, not fixed by
#   this hook). Without --continue, that one failure aborts the whole turbo
#   run and leaves every other, unrelated package unbuilt too.
pnpm build:unsafe --continue=always || true

# apps/www's build regenerates src/routeTree.gen.ts via
# @tanstack/router-plugin's codegen, whose output format (quote style,
# import order) has drifted from what's committed as the plugin version
# floats on its ^ range. It's fully derived from src/routes/** - discard
# any diff so the build doesn't leave every session starting dirty.
git -C "$CLAUDE_PROJECT_DIR" checkout -- apps/www/src/routeTree.gen.ts 2>/dev/null || true
