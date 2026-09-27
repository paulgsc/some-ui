import { defineConfig } from "vitest/config"

// Unit tests for the commons primitives that need a DOM but not a browser
// (lifetimes, the testing probes). The Playwright specs under tests/ are the
// browser-invariant suite and keep their own runner; the two never overlap.
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/__tests__/**/*.test.ts"],
  },
  resolve: { tsconfigPaths: true },
})
