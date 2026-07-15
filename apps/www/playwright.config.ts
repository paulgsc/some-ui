/**
 * Headless-Chromium Playwright configuration for apps/www.
 *
 * Scope: config/behaviour regression checks that don't need the app built
 * (e.g. tests/csp - asserts the CSP header actually shipped in the Docker
 * image, via page.route fulfilment rather than a running server/container).
 * Not a browser/UI E2E suite for the app itself.
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
