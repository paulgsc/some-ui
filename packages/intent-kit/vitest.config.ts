import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Pure logic - no React, no DOM. A test needing jsdom here would be the
    // Doctrine §1/Pushback 3 split (packages/SHARED_WORKSPACE_DOCTRINE.md)
    // having been violated; see the package's own tsconfig/package.json
    // tests for the mechanical check.
    environment: "node",
    globals: true,
    include: ["**/*.test.{ts,tsx}"],
  },
})
