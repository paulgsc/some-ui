/**
 * suspender-ledger — Playwright E2E configuration.
 *
 * Scope: the suspend page (`dist/suspend.html` + `suspend.js`) only.
 *
 * Why this is CI-portable (unlike the sibling extensions' E2E suites):
 *   The suspend page is pure web — it reads `url`/`title`/`favicon` from the
 *   page address and renders/restores entirely through DOM + `location`, with
 *   zero `browser.*` API usage. So there is nothing to load into a browser as
 *   an extension: we just serve the built `dist/` over HTTP and drive the page
 *   in headless Chromium. No `--load-extension`, no signing, no nix shell.
 *
 * What this covers that vitest/jsdom cannot:
 *   - real URLSearchParams parsing of query + hash on a real Location
 *   - favicon `<link rel="icon">` injection into a real document <head>
 *   - click / Enter → `location.replace(url)` actually navigating the tab
 *   all against the PRODUCTION bundle, not the TS source.
 *
 * The popup/worker surfaces are intentionally NOT covered here — they depend
 * on the `browser.*` API and are already exercised by the vitest component
 * suite; an E2E mock would only duplicate that coverage.
 */

import { defineConfig, devices } from "@playwright/test"

const PORT = 4318
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",

  timeout: 30_000,
  retries: 0,
  workers: 1,

  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Allow pointing at a system / pre-provisioned Chromium when the
        // Playwright CDN is unreachable (e.g. locked-down CI). Falls back to
        // the Playwright-managed browser when unset.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
          : {},
      },
    },
  ],

  // Build the Firefox bundle, then serve dist/ as a static site so the
  // page's absolute asset paths (`/suspend.js`, `/safe-url.js`) resolve.
  webServer: {
    command: `pnpm build:firefox && pnpm exec vite preview --config vite.config.firefox.ts --port ${PORT} --strictPort`,
    url: `${BASE_URL}/suspend.html`,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
})
