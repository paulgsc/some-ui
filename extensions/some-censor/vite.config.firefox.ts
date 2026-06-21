/**
 *
 * Firefox MV2 production build.
 *
 * Differences from the Chromium config:
 *   - Copies firefox-v2-manifest.json → dist/manifest.json
 *   - Aliases @censor/platform/api → api.firefox.ts  (browser.* global)
 *   - Output dir: dist/ (same — clean CI)
 *
 * Usage:
 *   pnpm build:firefox
 *   web-ext run --source-dir dist/
 */

import { copyFileSync } from "fs"
import { resolve } from "path"
import type { Plugin } from "vite"
import { defineConfig } from "vite"
import tsconfigPaths from "vite-tsconfig-paths"

/**
 * One-shot plugin: copies the MV2 manifest after the bundle is written so
 * Rollup's emptyOutDir: true doesn't race with a pre-copy.
 */
function firefoxManifestPlugin(): Plugin {
  return {
    name: "boyo-firefox-manifest",
    closeBundle() {
      copyFileSync(
        resolve(__dirname, "public/firefox-v2-manifest.json"),
        resolve(__dirname, "dist/manifest.json")
      )
      console.log("[BOYO] Wrote Firefox MV2 manifest → dist/manifest.json")
    },
  }
}

export default defineConfig({
  plugins: [tsconfigPaths(), firefoxManifestPlugin()],

  build: {
    rollupOptions: {
      input: {
        content: resolve(__dirname, "src/content/content.ts"),
        background: resolve(__dirname, "src/background/background.ts"),
      },
      output: {
        manualChunks: () => {}, // single IIFE per entry — no shared runtime chunk
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "content") return "content.js"
          if (chunkInfo.name === "background") return "background.js"
          return "[name].js"
        },
        chunkFileNames: "[name].js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === "popup.html") return "popup.html"
          if (assetInfo.name?.endsWith(".css")) return "styles/[name][extname]"
          return "assets/[name][extname]"
        },
      },
    },
    outDir: "dist",
    emptyOutDir: true,
  },

  resolve: {
    alias: {
      // ── Platform adapter swap ────────────────────────────────────────────
      // Replace the canonical api.ts with the Firefox-specific implementation.
      // Vite resolves this alias before module resolution, so api.ts is never
      // bundled — only api.firefox.ts is inlined into each IIFE.
      "@censor/platform/content": resolve(
        __dirname,
        "src/lib/platform/content/api.firefox.ts"
      ),

      "@censor/platform/background": resolve(
        __dirname,
        "src/lib/platform/background/api.firefox.ts"
      ),

      "@censor": resolve(__dirname, "src"),
    },
  },
})
