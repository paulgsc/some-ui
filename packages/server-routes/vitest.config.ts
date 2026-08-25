import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Reads two checked-in files off disk and regex-parses text - no DOM.
    environment: "node",

    // Allows 'describe', 'it', 'expect' without importing them in every file
    globals: true,

    include: ["**/*.test.{ts,tsx}"],
  },
})
