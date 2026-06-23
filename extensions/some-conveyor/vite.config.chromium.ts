/**
 *
 * Chromium MV3 build — used for Playwright E2E testing and Chromium distribution.
 *
 * Differences from the Firefox config:
 *   - Uses public/manifest.json (MV3) as-is — copyPublicDir: true handles it
 *   - Aliases @conveyor/platform/api → api.chrome.ts  (chrome.* global)
 *
 * Usage:
 *   pnpm build:chromium          # produces dist/ loadable via --load-extension
 *   pnpm test:e2e                # calls build:chromium then runs Playwright
 */

import { resolve } from "path"
import { defineConfig } from "vite"
import tsconfigPaths from "vite-tsconfig-paths"

export default defineConfig({
  plugins: [tsconfigPaths()],

  build: {
    rollupOptions: {
      input: {
        content: resolve(__dirname, "src/content/content.ts"),
        background: resolve(__dirname, "src/background/background.ts"),
      },
      // polyhedron is a wasm-bindgen crate built separately (crates/polyhedron).
      // Its dist/ doesn't exist at tsc/vite time; the runtime import is already
      // guarded with a .catch in WasmBridge, so externalizing here is safe.
      external: ["polyhedron"],
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
    // copyPublicDir: true (default) copies public/manifest.json → dist/manifest.json.
    // The MV3 manifest is the canonical public/manifest.json, so no plugin needed.
  },

  resolve: {
    alias: {
      // ── Platform adapter swap ────────────────────────────────────────────
      // Replace the canonical api.ts with the Chromium-specific implementation.
      // Only api.chrome.ts is inlined — api.ts and api.firefox.ts are never
      // seen by this bundle.
      "@conveyor/platform/content": resolve(
        __dirname,
        "src/lib/platform/content/api.chrome.ts"
      ),

      "@conveyor/platform/background": resolve(
        __dirname,
        "src/lib/platform/background/api.chrome.ts"
      ),

      "@conveyor": resolve(__dirname, "src"),
    },
  },
})
