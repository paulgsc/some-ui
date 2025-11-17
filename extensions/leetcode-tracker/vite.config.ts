import path from "path"
import { defineConfig } from "vite"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: path.resolve(__dirname, "src/popup/popup.html"),
        content: path.resolve(__dirname, "src/content/content.ts"),
        background: path.resolve(__dirname, "src/background/background.ts"),
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
          if (assetInfo.name === "popup.html") return "popup.html"
          if (assetInfo.name?.endsWith(".css")) {
            // Route CSS files to styles directory
            if (assetInfo.name.includes("content")) return "styles/content.css"
            if (assetInfo.name.includes("popup")) return "styles/popup.css"
            return "styles/[name][extname]"
          }
          return "assets/[name][extname]"
        },
      },
      // Aggressive tree shaking
      treeshake: {
        preset: "smallest",
        moduleSideEffects: false,
      },
    },
    cssCodeSplit: true, // Changed to true to separate CSS files
  },
  define: {
    global: "globalThis",
  },
})
