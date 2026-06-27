import { resolve } from "path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@suspender/platform": resolve(__dirname, "src/lib/platform/firefox.ts"),
      "@suspender": resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // tests/** holds Playwright E2E specs (*.spec.ts); keep vitest scoped to
    // the unit suite under src/ so it does not try to run them.
    exclude: ["**/node_modules/**", "**/tests/**"],
  },
})
