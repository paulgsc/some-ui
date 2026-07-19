/**
 * Classifier corpus configuration.
 *
 * Scope: headless Chromium only — no `--load-extension`, no persistent
 * profile, no built extension bundle. some-filter's own e2e suite
 * (`extensions/some-filter/tests/e2e`) proves the *extension* wires the
 * classifier correctly end to end; this suite exists to test the
 * classifier itself — `classifyPage`/`detect` (theme-detector.ts) and
 * `comfortReport`/`satisfiesComfort` (adapter/swatches.ts) — against a
 * small, human-labeled fixture corpus (#721, #722). A plain Chromium page
 * is all real DOM/CSS rendering (getComputedStyle, luminance, contrast)
 * needs; loading an extension would only add the Nix-patched-Chromium and
 * `pnpm build:chromium` prerequisites some-filter's suite carries for a
 * reason this suite has no reason to inherit.
 *
 * Runtime: single worker, no retries — see transport's own conformance
 * suite (`extensions/transport/playwright.config.ts`) for the identical
 * rationale this config mirrors.
 */

import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",

  globalSetup: "./tests/e2e/global-setup.ts",

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
