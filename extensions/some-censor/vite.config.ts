import { resolve } from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Separate configs for different extension contexts
const isBackground = process.env.BUILD_TARGET === "background"
const isContent = process.env.BUILD_TARGET === "content"

export default defineConfig({
  plugins: [
    // Only use React plugin for popup (default build)
    !isBackground && !isContent ? react() : null,
  ].filter(Boolean),
  build: {
    sourcemap: false,
    rollupOptions:
      isBackground || isContent
        ? {
            // Background & Content: IIFE format, single entry
            input: isBackground
              ? resolve(__dirname, "src/background/background.ts")
              : resolve(__dirname, "src/content/content.ts"),
            output: {
              format: "iife",
              manualChunks: undefined,
              entryFileNames: isBackground ? "background.js" : "content.js",
              assetFileNames: (assetInfo) => {
                if (assetInfo.name?.endsWith(".css"))
                  return "styles/[name][extname]"
                return "assets/[name][extname]"
              },
            },
          }
        : {
            // Popup: ESM format, multiple entries allowed
            input: {
              popup: resolve(__dirname, "src/popup/popup.html"),
            },
            output: {
              entryFileNames: "[name].js",
              chunkFileNames: "[name].js",
              assetFileNames: (assetInfo) => {
                if (assetInfo.name === "popup.html") return "popup.html"
                if (assetInfo.name?.endsWith(".css"))
                  return "styles/[name][extname]"
                return "assets/[name][extname]"
              },
            },
            // Aggressive tree shaking
            treeshake: {
              preset: "smallest",
              moduleSideEffects: false,
            },
          },
    cssCodeSplit: false,
    outDir: "dist",
    emptyOutDir: false,
  },
  resolve: {
    alias: {
      "@censor": resolve(__dirname, "src"),
    },
  },
})
