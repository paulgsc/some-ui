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
    emptyOutDir: false, // Don't empty on each build
    rollupOptions: {
      input: {
        popup: path.resolve(__dirname, "src/popup/popup.html"),
      },
      output: {
        format: "iife",
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === "popup.html") return "popup.html"
          if (assetInfo.name?.endsWith(".css")) return "styles/[name][extname]"
          return "assets/[name][extname]"
        },
      },
      treeshake: {
        preset: "smallest",
        moduleSideEffects: false,
      },
    },
    cssCodeSplit: false,
  },
  define: {
    global: "globalThis",
  },
})
