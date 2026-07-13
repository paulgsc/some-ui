import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Unit tests live next to the source they cover. The Playwright e2e specs
    // under tests/e2e/ import @playwright/test and are driven by Playwright, not
    // vitest — keep the two runners from colliding.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "dist", "tests/e2e/**"],
  },
  resolve: { tsconfigPaths: true },
})
