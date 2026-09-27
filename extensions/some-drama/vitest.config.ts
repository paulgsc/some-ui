import { defineConfig } from "vitest/config"

// Dedicated vitest config so the test runner never loads the extension build
// config (vite.config.ts calls extensionConfig from @some-extension/common,
// whose plugin graph is irrelevant to — and would fail to load under — vitest).
// Unit tests cover the pure logic/ layer; tests/ holds build-output checks
// (the generated stylesheet). Neither needs a DOM environment.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}", "tests/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
  },
  resolve: { tsconfigPaths: true },
})
