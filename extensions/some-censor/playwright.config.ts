/**
 * BOYO extension E2E configuration.
 *
 * Key decisions:
 *
 *   1. globalSetup/globalTeardown own the Firefox process lifecycle.
 *      globalSetup spawns `web-ext run --remote-debugging-port=9222` and
 *      waits for CDP readiness. globalTeardown kills it. Tests never restart
 *      Firefox — the extension stays loaded for the entire suite.
 *
 *   2. No `projects` block. The fixture attaches via chromium.connectOverCDP()
 *      to the already-running Firefox. A projects entry would cause Playwright
 *      to spin up a second managed Firefox with no extension.
 *
 *   3. chromium.connectOverCDP() against Firefox. Playwright's `firefox` type
 *      has no connectOverCDP(). Firefox implements enough CDP for page.evaluate()
 *      and page.goto() — which is all pollDebug() needs.
 *
 *   4. No retries. pollDebug has its own timeout/retry loop. Test-level retries
 *      would mask real regressions.
 *
 *   5. Single worker. The Firefox process is a singleton.
 */

import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",

  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",

  timeout: 30_000,
  retries: 0,
  workers: 1,

  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],

  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  // No projects — fixture.ts attaches to the web-ext Firefox via CDP.
})
