import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.{test,spec}.ts"],
    exclude: ["node_modules", "dist", "tests/e2e/**"],
    // contracts/ and every stage module land ahead of their own specs
    // (canon-first, tests-second); a clean run with zero specs must still
    // exit 0 rather than fail the workspace's own CI gate.
    passWithNoTests: true,
  },
})
