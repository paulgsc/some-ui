import { resolve } from "path"
import react from "@vitejs/plugin-react"
import topLevelAwait from "vite-plugin-top-level-await"
import wasm from "vite-plugin-wasm"
import { defineConfig } from "vitest/config"

// https://vitejs.dev/config/
export default defineConfig({
  // @ts-expect-error vite-plugin-wasm/vite-plugin-top-level-await resolve
  // against a different hoisted vite version than this repo's own vite dep
  plugins: [wasm(), topLevelAwait(), react()],
  test: {
    environment: "node",
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
      include: ["packages/*/src/**", "packages/*/test/**", "extensions/*/**"],
      exclude: ["packages/tsconfig/**", "packages/rollup-config/**"],
    },
    restoreMocks: true,
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
  },
  resolve: {
    alias: {
      "some-charts": resolve(
        import.meta.dirname,
        "./crates/some-charts/dist/some_charts.js"
      ),
    },
    tsconfigPaths: true,
  },
})
