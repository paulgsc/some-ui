/**
 *
 * Firefox MV3 production build.
 *
 * Differences from the Chromium config:
 *   - Copies firefox-v3-manifest.json → dist/manifest.json (MV3 with background.scripts)
 *   - Aliases @conveyor/platform/api → api.firefox.ts  (browser.* global)
 *   - Output dir: dist/ (same — clean CI)
 *
 * Usage:
 *   pnpm build:firefox
 *   web-ext run --source-dir dist/
 */

import { copyFileSync, cpSync, existsSync } from "fs"
import { resolve } from "path"
import type { Plugin } from "vite"
import { defineConfig } from "vite"
import tsconfigPaths from "vite-tsconfig-paths"

const repoRoot = resolve(__dirname, "../..")

/**
 * One-shot plugin: copies the MV3 manifest after the bundle is written so
 * Rollup's emptyOutDir: true doesn't race with a pre-copy.
 */
function firefoxManifestPlugin(): Plugin {
  return {
    name: "boyo-firefox-manifest",
    closeBundle(): void {
      copyFileSync(
        resolve(__dirname, "public/firefox-v3-manifest.json"),
        resolve(__dirname, "dist/manifest.json")
      )
      // eslint-disable-next-line no-console
      console.log("[BOYO] Wrote Firefox MV3 manifest → dist/manifest.json")
    },
  }
}

function polyhedronAssetsPlugin(): Plugin {
  return {
    name: "boyo-polyhedron-assets",
    closeBundle(): void {
      const src = resolve(repoRoot, "crates/polyhedron/dist")
      const dst = resolve(__dirname, "dist/polyhedron")

      if (!existsSync(src)) {
        throw new Error(`Missing polyhedron build output: ${src}`)
      }

      cpSync(src, dst, {
        recursive: true,
        force: true,
      })
      // eslint-disable-next-line no-console
      console.log("[BOYO] Copied crates/polyhedron/dist → dist/polyhedron")
    },
  }
}

export default defineConfig({
  plugins: [tsconfigPaths(), firefoxManifestPlugin(), polyhedronAssetsPlugin()],

  build: {
    rollupOptions: {
      input: {
        content: resolve(__dirname, "src/content/content.ts"),
        background: resolve(__dirname, "src/background/background.ts"),
      },
      // @some-ui/polyhedron is a wasm-bindgen crate built separately
      // (crates/polyhedron). Its dist/ doesn't exist at tsc/vite time; the
      // runtime import is already guarded with a .catch in WasmBridge, so
      // externalizing here is safe.
      external: ["@some-ui/polyhedron"],
      output: {
        manualChunks: () => {}, // single IIFE per entry — no shared runtime chunk
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "content") return "content.js"
          if (chunkInfo.name === "background") return "background.js"
          return "[name].js"
        },
        chunkFileNames: "[name].js",
        assetFileNames: (assetInfo): string => {
          if (assetInfo.names.includes("popup.html")) return "popup.html"
          if (assetInfo.names.some((n): boolean => n.endsWith(".css")))
            return "styles/[name][extname]"
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
      "@conveyor/platform/content": resolve(
        __dirname,
        "src/lib/platform/content/api.firefox.ts"
      ),

      "@conveyor/platform/background": resolve(
        __dirname,
        "src/lib/platform/background/api.firefox.ts"
      ),

      "@conveyor": resolve(__dirname, "src"),
    },
  },
})
