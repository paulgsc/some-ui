/**
 * BOYO extension E2E configuration.
 *
 * Key decisions:
 *
 *   1. Chromium via launchPersistentContext + --load-extension.
 *      Firefox has no supported Playwright path for loading temporary unsigned
 *      extensions. Chromium's --load-extension loads an unpacked MV3 extension
 *      directly from dist/, no signing required. The FSM / DOM masking logic
 *      under test is browser-agnostic.
 *
 *   2. Test manifest patch. The production manifest limits content script
 *      injection to youtube.com URLs. test:e2e runs scripts/patch-test-manifest
 *      after build:chromium to also match file:// URLs (the fixture pages).
 *      Source public/manifest.json is never modified.
 *
 *   3. CI portability. fixture.ts detects the absence of DISPLAY/WAYLAND_DISPLAY
 *      and passes --headless=new to Chromium. Chrome's new headless mode
 *      supports extension content script injection (unlike old headless).
 *
 *   4. No retries. pollDebug has its own timeout/retry loop. Test-level retries
 *      would mask real regressions.
 *
 *   5. Single worker. The browser context is a singleton per test run.
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
