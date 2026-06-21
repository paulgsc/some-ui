/**
 * Firefox MV2 production build.
 *
 * Key differences from the Chromium config:
 *   - Aliases @filter/lib/platform/api → api.firefox.ts (browser.* global)
 *   - Plugin overwrites dist/manifest.json with Firefox MV2 manifest after bundle
 *   - Includes popup entry for the full extension
 *
 * Usage:
 *   pnpm build:firefox
 *   web-ext run --source-dir dist/
 */

import { copyFileSync } from "fs"
import { resolve } from "path"
import type { Plugin } from "vite"
import { defineConfig } from "vite"

function firefoxManifestPlugin(): Plugin {
  return {
    name: "filter-firefox-manifest",
    closeBundle(): void {
      copyFileSync(
        resolve(__dirname, "public/manifest.firefox.json"),
        resolve(__dirname, "dist/manifest.json")
      )
      process.stdout.write(
        "[FILTER] Wrote Firefox MV2 manifest → dist/manifest.json\n"
      )
    },
  }
}

// See the note in vite.config.chromium.ts: entries are built one per invocation
// (BUILD_TARGET) so cross-entry shared modules (e.g. lib/tab-state) inline into
// each standalone bundle instead of splitting into a chunk content scripts
// cannot load. package.json's build:firefox orchestrates the passes.
const ENTRIES: Record<string, string> = {
  content: resolve(__dirname, "src/content/content.ts"),
  background: resolve(__dirname, "src/background/background.ts"),
  popup: resolve(__dirname, "popup.html"),
}

const TARGET = process.env["BUILD_TARGET"]
const input =
  TARGET && ENTRIES[TARGET] ? { [TARGET]: ENTRIES[TARGET] } : ENTRIES

export default defineConfig({
  plugins: [firefoxManifestPlugin()],
  build: {
    emptyOutDir: process.env["BUILD_CLEAN"] === "1" || !TARGET,
    rollupOptions: {
      input,
      output: {
        manualChunks: () => {},
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "content") return "content.js"
          if (chunkInfo.name === "background") return "background.js"
          if (chunkInfo.name === "popup") return "popup.js"
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
        "src/lib/platform/content/api.firefox.ts"
      ),

      "@filter/platform/background": resolve(
        __dirname,
        "src/lib/platform/background/api.firefox.ts"
      ),

      "@filter": resolve(__dirname, "src"),
    },
  },
})
