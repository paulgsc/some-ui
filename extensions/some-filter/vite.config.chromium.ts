/**
 * Chromium build — used for Playwright E2E testing.
 *
 * Differences from the default vite.config.ts:
 *   - Excludes popup.html (not needed for E2E)
 *   - Outputs content.js and background.js to dist/
 *   - copyPublicDir: true (default) copies prepaint.css, prepaint-start.js,
 *     prepaint-end.js, and manifest.json to dist/ so --load-extension works.
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
      "@filter": resolve(__dirname, "src"),
    },
  },
})
