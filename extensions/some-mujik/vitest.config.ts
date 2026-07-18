import { defineConfig } from "vitest/config"

// Dedicated vitest config so the test runner never loads the extension build
// config (vite.config.ts calls extensionConfig from @some-extension/common,
// whose plugin graph is irrelevant to — and would fail to load under — vitest).
//
// Unit tests live next to the source they cover. The Playwright e2e specs under
// tests/e2e/ import @playwright/test and are driven by Playwright, not vitest —
// keep the two runners from colliding. There are no vitest unit tests yet, so
// don't fail the run when none are found.
export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "dist", "tests/e2e/**"],
    passWithNoTests: true,
  },
  resolve: { tsconfigPaths: true },
})
