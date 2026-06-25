/**
 * Firefox MV3 production build.
 *
 * Key differences from a typical Vite config:
 *   - manualChunks: () => {} prevents code-splitting that breaks Firefox MV3
 *     service workers (each entry must be a single flat file)
 *   - Plugin overwrites dist/manifest.json with Firefox MV3 manifest after bundle
 *   - worker entry → worker.js (background service worker)
 *   - watch entry  → watch.js  (content script)
 *
 * Usage:
 *   pnpm build:firefox
 *   web-ext lint --source-dir dist
 */

import { copyFileSync } from "fs"
import { resolve } from "path"
import type { Plugin } from "vite"
import { defineConfig } from "vite"

function firefoxManifestPlugin(): Plugin {
  return {
    name: "suspender-firefox-manifest",
    closeBundle(): void {
      copyFileSync(
        resolve(__dirname, "public/manifest.firefox.json"),
        resolve(__dirname, "dist/manifest.json")
      )
      process.stdout.write(
        "[SUSPENDER] Wrote Firefox MV3 manifest → dist/manifest.json\n"
      )
    },
  }
}

export default defineConfig({
  plugins: [firefoxManifestPlugin()],
  build: {
    rollupOptions: {
      input: {
        worker: resolve(__dirname, "src/worker/worker.ts"),
        watch: resolve(__dirname, "src/content/watch.ts"),
        meta: resolve(__dirname, "src/content/meta.ts"),
        popup: resolve(__dirname, "popup.html"),
        suspend: resolve(__dirname, "suspend.html"),
      },
      output: {
        manualChunks: () => {},
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "worker") return "worker.js"
          if (chunkInfo.name === "watch") return "watch.js"
          if (chunkInfo.name === "meta") return "data/inject/meta.js"
          if (chunkInfo.name === "popup") return "popup.js"
          if (chunkInfo.name === "suspend") return "suspend.js"
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
      "@suspender/platform": resolve(__dirname, "src/lib/platform/firefox.ts"),
      "@suspender": resolve(__dirname, "src"),
    },
  },
})
