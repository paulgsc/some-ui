import { defineConfig } from "vitest/config"

export default defineConfig({
  // The tests import sources through tsconfig.json's "@/*" alias.
  resolve: { tsconfigPaths: true },
  test: {
    name: "@some-ui/vite-config",
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Each case runs a real vite build over a fixture workspace.
    testTimeout: 30_000,
  },
})
