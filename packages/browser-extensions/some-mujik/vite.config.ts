import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@mujik": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      external: ["chrome"],
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
          return "[name].js"
        },
        chunkFileNames: "[name].js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === "popup.html") return "popup.html"
          if (assetInfo.name?.endsWith(".css")) return "styles/[name][extname]"
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
    assetsInlineLimit: 0,
  },
  define: {
    global: "globalThis",
  },
})
