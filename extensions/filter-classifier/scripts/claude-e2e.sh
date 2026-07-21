#!/usr/bin/env bash
set -euo pipefail

# playwright.config.ts only overrides executablePath when
# PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH is set — otherwise Playwright resolves
# its own managed browser for the installed @playwright/test version, which
# in Claude Code's remote sandbox means a chrome-headless-shell revision that
# was never downloaded (only a plain Chromium build is pre-installed there,
# under $PLAYWRIGHT_BROWSERS_PATH). Point at that pre-installed Chromium
# instead, so `pnpm test:claude:e2e` works there without touching the
# `pnpm test:e2e` default every other environment already works with.

if [ -n "${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-}" ]; then
  : # already set — respect it
elif [ -n "${PLAYWRIGHT_BROWSERS_PATH:-}" ] && [ -x "${PLAYWRIGHT_BROWSERS_PATH}/chromium" ]; then
  export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="${PLAYWRIGHT_BROWSERS_PATH}/chromium"
else
  echo "[FILTER-CLASSIFIER] test:claude:e2e needs a pre-installed Chromium binary." >&2
  echo "Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, or run this somewhere that" >&2
  echo "exposes one via \$PLAYWRIGHT_BROWSERS_PATH/chromium (e.g. Claude" >&2
  echo "Code's remote sandbox). Elsewhere, use:" >&2
  echo "  pnpm test:e2e" >&2
  exit 1
fi

exec playwright test --config playwright.config.ts "$@"
