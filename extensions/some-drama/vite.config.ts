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
        manualChunks: () => {}, // prevents shared chunks
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "content") return "content.js"
          if (chunkInfo.name === "background") return "background.js"
          if (chunkInfo.name === "popup") return "popup.js"
          return "[name].js"
        },
        chunkFileNames: "[name].js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.names.includes("popup.html")) return "popup.html"
          if (assetInfo.names.includes("popup.css")) return "popup.css"
          if (assetInfo.names.some((n) => n.endsWith(".css")))
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
      "@drama": resolve(__dirname, "src"),
    },
  },
})
