import tsconfigPaths from "vite-tsconfig-paths"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [
    tsconfigPaths({
      // Scope to this package only — prevents monorepo-wide scan from
      // hitting broken tsconfig.json files in other workspaces (e.g. delme/).
      projects: ["./tsconfig.json"],
    }),
  ],
  test: {
    name: "maishatu-eslint-kit",
    environment: "node",
    include: ["tests/**/*.test.ts", "fixtures"],
    // Type-aware rules spin up a TS language service per-suite.
    // A generous timeout prevents false failures on slow CI machines.
    testTimeout: 30_000,
    // Each test file gets its own worker to avoid ESLint instance pollution
    // between suites and to prevent language service state from leaking.
    pool: "forks",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/types/**"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
      },
    },
    reporters: ["verbose"],
  },
})
