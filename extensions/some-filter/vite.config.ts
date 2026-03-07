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
        manualChunks: undefined,
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "content") return "content.js"
          if (chunkInfo.name === "background") return "background.js"
          if (chunkInfo.name === "popup") return "popup.js"
          return "[name].js"
        },
        chunkFileNames: "[name].js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === "popup.html") return "popup.html"
          if (assetInfo.name === "popup.css") return "popup.css"
          if (assetInfo.name?.endsWith(".css")) return "[name][extname]"
          if (assetInfo.name?.match(/\.(png|jpg|jpeg|svg|gif)$/)) {
            return "assets/[name][extname]"
          }
          return "[name][extname]"
        },
      },
    },
    outDir: "dist",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@censor": resolve(__dirname, "src"),
    },
  },
})
