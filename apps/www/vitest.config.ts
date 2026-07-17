import { defineConfig } from "vitest/config"

/**
 * Without this, `vitest run` (invoked from this package's own directory)
 * falls back to vitest's default include glob, which also picks up
 * tests/csp/csp.spec.ts — a Playwright-only spec (playwright.config.ts
 * points testDir at ./tests). Vitest then fails trying to execute
 * Playwright's test.describe() outside Playwright's own runner.
 *
 * Scoping to src/** mirrors the root vitest.config.mts convention and
 * cleanly separates the two runners' domains: unit tests live under src/,
 * Playwright specs live under tests/.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
  },
})
