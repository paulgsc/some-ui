import { resolve } from "path"
import react from "@vitejs/plugin-react"
import tsconfigPaths from "vite-tsconfig-paths"
import { defineConfig } from "vitest/config"

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
    exclude: [
      "react-smooth",
      "**/node_modules/**",
      "**/dist/**",
      "**/.idea/**",
      "**/.git/**",
      "**/.cache/**",
      "**/build/**",
      "**/scripts/**",
      "**/.stryker-tmp/**",
    ],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**", "packages/*/test/**"],
      exclude: ["packages/tsconfig/**", "packages/rollup-config/**"],
    },
    restoreMocks: true,
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
  },
})
