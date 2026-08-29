import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@job-tracker": new URL("./src", import.meta.url).pathname,
    },
  },

  test: {
    // Pure functions over an array — no DOM needed, same as
    // packages/activity-catalog. Keeping the node environment is what makes
    // "this package doesn't need a browser" checkable rather than merely
    // asserted.
    environment: "node",
    globals: true,
    include: ["**/*.test.ts"],
  },
})
