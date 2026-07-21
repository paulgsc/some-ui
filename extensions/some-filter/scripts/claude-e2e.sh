#!/usr/bin/env bash
set -euo pipefail

# some-filter's e2e fixture (tests/e2e/fixture.ts) launches Chromium via
# PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, normally set by `nix develop
# .#playwright` (nix/playwright/default.nix). Claude Code's remote sandbox
# has no Nix shell, but it does pre-install its own Playwright browser cache
# at $PLAYWRIGHT_BROWSERS_PATH. This script points the fixture at that
# browser instead, so `pnpm test:claude:e2e` works there without touching
# the Nix-gated `pnpm test:e2e` default the rest of the team uses.

if [ -n "${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-}" ]; then
  : # already set (e.g. inside `nix develop .#playwright`) — respect it
elif [ -n "${PLAYWRIGHT_BROWSERS_PATH:-}" ] && [ -x "${PLAYWRIGHT_BROWSERS_PATH}/chromium" ]; then
  export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="${PLAYWRIGHT_BROWSERS_PATH}/chromium"
else
  echo "[FILTER] test:claude:e2e needs a pre-installed Chromium binary." >&2
  echo "Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, or run this somewhere" >&2
  echo "that exposes one via \$PLAYWRIGHT_BROWSERS_PATH/chromium (e.g." >&2
  echo "Claude Code's remote sandbox)." >&2
  echo "" >&2
  echo "For the human/Nix workflow, use instead:" >&2
  echo "  nix develop .#playwright" >&2
  echo "  pnpm test:e2e" >&2
  exit 1
fi

pnpm build:chromium
exec playwright test "$@"
