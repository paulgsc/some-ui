/**
 * Generic transport conformance suite configuration (S11).
 *
 * Scope: headless Chromium only — no extension loading. The suite asserts
 * transport *protocol* guarantees (bootstrap persistence, epoch transitions,
 * hypothesis convergence, actuation idempotence) against the null adapter,
 * never a domain-specific property. See canon §8.3 and §D.
 */

import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/e2e",
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
