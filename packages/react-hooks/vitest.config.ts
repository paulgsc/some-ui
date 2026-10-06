import { defineConfig } from "vitest/config"

export default defineConfig({
  // tsconfig.json's `@react-hooks/*` path, which the hooks use for each other
  // (a parent-relative `../` import is lint-banned).
  resolve: {
    alias: {
      "@react-hooks": new URL("./src", import.meta.url).pathname,
    },
  },

  test: {
    // Each hook test opts into jsdom with a `@vitest-environment` pragma.
    environment: "node",
    globals: true,
    include: ["**/*.test.{ts,tsx}"],
  },
})
