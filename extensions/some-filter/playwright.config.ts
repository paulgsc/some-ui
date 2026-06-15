/**
 * some-filter extension E2E configuration.
 *
 * Key decisions:
 *
 *   1. Chromium via launchPersistentContext + --load-extension.
 *      Firefox has no supported Playwright path for loading temporary unsigned
 *      extensions without a separate web-ext process + CDP bridge. Chromium
 *      solves this in one call. The logic under test (classifyPage, prepaint
 *      handshake, dark-theme injection) is browser-agnostic.
 *
 *   2. Single worker — the browser context is a singleton per test file.
 *      Each test opens a fresh page via fixture.goto(); the context itself
 *      is torn down once per worker.
 *
 *   3. No retries — waitForFunction has its own timeout loop. Test-level
 *      retries would mask real regressions.
 *
 * NixOS setup:
 *   Enter the playwright nix shell before running tests:
 *     nix develop .#playwright
 *   Then:
 *     pnpm test:e2e
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
})
