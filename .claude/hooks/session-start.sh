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
#   hangul-game-core, some-hexagon). They're built with wasm-pack, and
#   cargo/rustup are actually preinstalled here — but wasm-pack itself, the
#   wasm32-unknown-unknown target, and wasm-opt's binaryen download all need
#   workarounds (see scripts/bootstrap-wasm-crates.sh for the full recipe).
#   That's slow (~4min of cargo compilation) and most sessions never touch
#   wasm code, so it's skipped by default here. If your task depends on a
#   package that imports one of these crates (e.g. @some-ui/honeycomb
#   depends on hangul-game-core, some-hexagon, polyhedron), run
#   `scripts/bootstrap-wasm-crates.sh` yourself before building/typechecking
#   that package.
# - `--continue=always`: packages/ui/input's own build still fails here even
#   with the wasm crates excluded from the graph, because its source
#   directly imports them (TS2307 — tracked separately as debt, not fixed by
#   this hook). Without --continue, that one failure aborts the whole turbo
#   run and leaves every other, unrelated package unbuilt too.
pnpm build:unsafe --filter='!./crates/*' --continue=always || true

# apps/www's build regenerates src/routeTree.gen.ts via
# @tanstack/router-plugin's codegen, whose output format (quote style,
# import order) has drifted from what's committed as the plugin version
# floats on its ^ range. It's fully derived from src/routes/** - discard
# any diff so the build doesn't leave every session starting dirty.
git -C "$CLAUDE_PROJECT_DIR" checkout -- apps/www/src/routeTree.gen.ts 2>/dev/null || true
