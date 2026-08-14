import { resolve } from "path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    exclude: ["**/node_modules/**", "**/tests/e2e/**"],
  },
  resolve: {
    alias: {
      "@some-ui/some-filter-fsm": resolve(
        __dirname,
        "./src/lib/__tests__/fixtures/some-filter-fsm.ts"
      ),
      "@filter": resolve(__dirname, "./src"),
    },
  },
})
