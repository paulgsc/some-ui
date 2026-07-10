import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Pure module-loading logic - no DOM needed.
    environment: "node",

    // Allows 'describe', 'it', 'expect' without importing them in every file
    globals: true,

    include: ["**/*.test.{ts,tsx}"],
  },
})
