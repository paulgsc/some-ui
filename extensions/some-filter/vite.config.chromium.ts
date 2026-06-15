/**
 * Chromium MV3 build — used for Playwright E2E testing.
 *
 * Key differences from the Firefox config:
 *   - Aliases @filter/lib/platform/api → api.chrome.ts (chrome.* global)
 *   - copyPublicDir: true (default) copies public/manifest.json (MV3) → dist/
 *   - Excludes popup (not needed for E2E)
 *
 * Usage:
 *   pnpm build:chromium        # produces dist/ loadable via --load-extension
 *   pnpm test:e2e              # build:chromium + playwright test
 */

import { resolve } from "path"
import { defineConfig } from "vite"

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        content: resolve(__dirname, "src/content/content.ts"),
        background: resolve(__dirname, "src/background/background.ts"),
      },
      output: {
        manualChunks: () => {},
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "content") return "content.js"
          if (chunkInfo.name === "background") return "background.js"
          return "[name].js"
        },
        chunkFileNames: "[name].js",
        assetFileNames: "[name][extname]",
      },
    },
    outDir: "dist",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      // Swap platform adapter: chrome.* → typeof browser cast
      "@filter/lib/platform/api": resolve(
        __dirname,
        "src/lib/platform/api.chrome.ts"
      ),
      "@filter": resolve(__dirname, "src"),
    },
  },
})
