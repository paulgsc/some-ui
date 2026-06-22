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

// Content scripts and the MV3 service worker are loaded as standalone files
// listed in the manifest — they cannot resolve a shared ES import chunk. When a
// module is imported by more than one entry (e.g. lib/tab-state), rollup would
// hoist it into its own chunk. To keep every entry self-contained we build one
// entry per invocation (BUILD_TARGET) so shared modules are inlined into each.
// package.json's build:chromium orchestrates the passes; BUILD_CLEAN=1 marks the
// first pass that may wipe dist.
const ENTRIES: Record<string, string> = {
  content: resolve(__dirname, "src/content/content.ts"),
  background: resolve(__dirname, "src/background/background.ts"),
}

const TARGET = process.env["BUILD_TARGET"]
const input =
  TARGET && ENTRIES[TARGET] ? { [TARGET]: ENTRIES[TARGET] } : ENTRIES

export default defineConfig({
  build: {
    emptyOutDir: process.env["BUILD_CLEAN"] === "1" || !TARGET,
    rollupOptions: {
      input,
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
  },
  resolve: {
    alias: {
      // ── Platform adapter swap ────────────────────────────────────────────
      // Replace the canonical api.ts with the Firefox-specific implementation.
      // Vite resolves this alias before module resolution, so api.ts is never
      // bundled — only api.firefox.ts is inlined into each IIFE.
      "@filter/platform/content": resolve(
        __dirname,
        "src/lib/platform/content/api.chrome.ts"
      ),

      "@filter/platform/background": resolve(
        __dirname,
        "src/lib/platform/background/api.chrome.ts"
      ),

      "@filter": resolve(__dirname, "src"),
    },
  },
})
