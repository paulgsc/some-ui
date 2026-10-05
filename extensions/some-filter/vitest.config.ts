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
      // Mirrors vite.config.ts's platformAlias(). The Firefox variant, because
      // vitest.setup.ts stubs `browser` (not `chrome`).
      "@filter/platform/content": resolve(
        import.meta.dirname,
        "./src/lib/platform/content/api.firefox.ts"
      ),
      "@filter/platform/background": resolve(
        import.meta.dirname,
        "./src/lib/platform/background/api.firefox.ts"
      ),
      "@filter": resolve(import.meta.dirname, "./src"),
    },
  },
})
