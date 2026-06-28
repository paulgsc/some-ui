/**
 * Browser-invariants Playwright configuration.
 *
 * Scope: headless Chromium only — no extension loading.
 * Purpose: assert that browser API behaviour at runtime matches the compile-time
 * assumptions baked into all extension workspaces. These tests are CI-portable
 * and must pass before any extension's test:e2e suite runs (turbo dependency).
 *
 * Key decisions:
 *   1. Headless Chromium via the standard `devices["Desktop Chrome"]` project.
 *      No launchPersistentContext, no --load-extension. Tests exercise vanilla
 *      browser APIs, not extension surfaces.
 *
 *   2. PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH allows CI runners or nix shells to point at a
 *      pre-provisioned binary (same convention as suspender-ledger).
 *
 *   3. Single worker. Tests are stateless and fast; parallelism adds noise.
 *
 *   4. No retries. Browser API behaviour must be deterministic; a flaky result
 *      means the assumption is wrong, not that we should retry.
 */

import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",

  timeout: 15_000,
  retries: 0,
  workers: 1,

  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],

  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]
          ? {
              executablePath:
                process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"],
            }
          : {},
      },
    },
  ],
})
