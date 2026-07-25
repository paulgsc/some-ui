import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@fkit": new URL("./src", import.meta.url).pathname,
    },
  },

  test: {
    // Pure fetch/retry logic - no DOM needed.
    environment: "node",

    // Allows 'describe', 'it', 'expect' without importing them in every file
    globals: true,

    include: ["**/*.test.{ts,tsx}"],
  },
})
