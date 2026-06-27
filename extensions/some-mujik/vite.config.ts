import { resolve } from "path"
import { defineConfig } from "vite"

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        content: resolve(__dirname, "src/content/content.ts"),
        background: resolve(__dirname, "src/background/background.ts"),
        popup: resolve(__dirname, "popup.html"),
      },
      output: {
        // Each entry is its own self-contained bundle — no dynamic linking.
        // This satisfies the extension constraint: no shared runtime chunks.
        manualChunks: undefined,
        entryFileNames: (chunk) => {
          if (chunk.name === "content") return "content.js"
          if (chunk.name === "background") return "background.js"
          if (chunk.name === "popup") return "popup.js"
          return "[name].js"
        },
        chunkFileNames: "[name].js",
        assetFileNames: (asset) => {
          // eslint-disable-next-line @typescript-eslint/no-deprecated
          if (asset.name?.endsWith(".css")) return "[name][extname]"
          // eslint-disable-next-line @typescript-eslint/no-deprecated
          if (asset.name?.match(/\.(png|jpg|jpeg|svg|gif|ico)$/)) {
            return "assets/[name][extname]"
          }
          return "[name][extname]"
        },
      },
    },
    // Enable CSS code splitting so each entry gets its own .css file:
    // content.css (injected via manifest content_scripts.css[])
    // popup.css   (loaded by popup.html)
    cssCodeSplit: true,
    outDir: "dist",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@mujik": resolve(__dirname, "src"),
    },
  },
})
