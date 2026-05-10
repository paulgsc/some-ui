import tsconfigPaths from "vite-tsconfig-paths"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name: "maishatu-eslint-kit",
    environment: "node",
    // Wire RuleTester to vitest before any test file runs
    // setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    // Type-aware rules spin up a TS language service per-suite.
    // A generous timeout prevents false failures on slow CI machines.
    testTimeout: 30_000,
    // Each test file gets its own worker to avoid Linter instance pollution
    pool: "forks",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/types/**"],
      // These thresholds enforce that new rules without tests fail CI
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
      },
    },
    reporters: ["verbose"],
  },
})
