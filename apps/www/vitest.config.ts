import { resolve } from "node:path"
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
    include: [
      "src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
      // The intent-census generator lives under scripts/ (it's a Node CLI,
      // not app source) but its own drift check belongs in the ordinary
      // `pnpm test` run so CI catches a stale docs/intent-census.md the same
      // way it catches any other regression - no separate workflow step to
      // gate, unlike the Playwright suites under tests/.
      "scripts/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}",
    ],
    // Repairs `localStorage` where the runtime shipped one of its own and
    // Vitest's jsdom environment therefore skipped jsdom's - the reason
    // audio-activity-notice's tests fail on CI's Node and pass on
    // everyone's. Inert where the environment is already sane; see the
    // file's header for the mechanism.
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      // Mirrors vite.config.ts's "@" -> "./src" alias - this config doesn't
      // extend that one, so tests importing a "@/..." module (most of src/
      // does) need their own copy of the same mapping.
      "@": resolve(__dirname, "./src"),
    },
  },
})
