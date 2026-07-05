import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // formatRelativeTime and speechReducer are pure logic - no DOM needed.
    environment: "node",

    // Allows 'describe', 'it', 'expect' without importing them in every file
    globals: true,

    include: ["**/*.test.{ts,tsx}"],
  },
})
