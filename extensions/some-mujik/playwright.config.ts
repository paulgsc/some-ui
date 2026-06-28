/**
 * some-mujik — Playwright E2E configuration.
 *
 * Scope: content-script smoke tests only. Chromium via launchPersistentContext
 * + --load-extension. fixture.ts passes --headless=new when no display server
 * is detected, enabling extension content script injection in CI environments.
 *
 * Why Chromium and not Firefox:
 *   Playwright has no supported path for loading temporary unsigned extensions
 *   into Firefox. Chromium's --load-extension solves this in one call.
 *
 * NixOS setup:
 *   nix develop .#playwright
 *   pnpm build:chromium && pnpm test:e2e
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
  },
})
