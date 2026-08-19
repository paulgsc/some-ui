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
      // Mirrors vite.config.ts's platformAlias(): content/background code
      // imports the platform-neutral "@filter/platform/*" specifier, resolved
      // per build target there. Tests need the same resolution — the Firefox
      // variant is picked because vitest.setup.ts stubs the WebExtension
      // `browser` global (not `chrome`), which is what api.firefox.ts reads.
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
