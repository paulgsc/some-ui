import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@activity-catalog": new URL("./src", import.meta.url).pathname,
    },
  },

  test: {
    // Nothing here touches a DOM: the whole package is pure functions over a
    // catalogue. Keeping the node environment is the point, not an omission -
    // it is what makes "this module is framework-agnostic" checkable rather
    // than merely asserted.
    environment: "node",
    globals: true,
    include: ["**/*.test.ts"],
  },
})
