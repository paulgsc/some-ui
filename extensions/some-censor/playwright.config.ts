/**
 * — BOYO extension E2E configuration.
 *
 * Key decisions:
 *
 *   1. Chromium only (for now). Extensions in Playwright require a persistent
 *      context, which only Chromium supports directly. Firefox needs a separate
 *      strategy (temporary addon install via geckodriver). Add a separate
 *      playwright.firefox.config.ts when needed.
 *
 *   2. No retries on CI. Our tests assert runtime convergence via pollDebug —
 *      flakiness should surface as a real bug, not be masked by retries.
 *      If a test fails consistently, it means a regression in the runtime,
 *      not a timing issue in the test.
 *
 *   3. No baseURL. We load file:// URLs (static fixtures), so no server needed.
 *
 *   4. Headed mode is required. Chromium extensions do not run in headless mode
 *      in Playwright. Set PLAYWRIGHT_HEADED=1 or use --headed. The config
 *      forces this via the fixture setup (see fixture.ts).
 *
 *   5. Single worker. Extension state is process-global (content script
 *      singleton). Parallel workers sharing the same --load-extension profile
 *      cause undefined behavior. Run serially.
 */

import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",

  // Timeout per test (not per assertion — pollDebug has its own timeouts)
  timeout: 30_000,

  // No retries — flakiness is a bug signal, not noise to suppress
  retries: 0,

  // Serial execution — extension context is a singleton
  workers: 1,

  // Output
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],

  use: {
    // Trace on failure — gives us a timeline to diagnose timing issues
    trace: "retain-on-failure",
    // Screenshot on failure
    screenshot: "only-on-failure",
    // Video on failure
    video: "retain-on-failure",
  },

  // No projects — single Chromium persistent context configured in fixture.ts
  projects: [
    {
      name: "boyo-firefox",
      use: {
        // browserName is ignored — fixture.ts uses chromium.launchPersistentContext directly
        // But we specify it here for the reporter
        browserName: "firefox",
      },
    },
  ],
})
