import { resolve } from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup/popup.html"),
        background: resolve(__dirname, "background/index.ts"),
        content: resolve(__dirname, "content/index.ts"),
      },
      output: {
        manualChunks: () => {}, // prevents shared chunks
        entryFileNames: (chunk) => {
          if (chunk.name === "popup") return "popup/[name].js"
          return "[name].js"
        },
        chunkFileNames: "[name].js",
        assetFileNames: (asset) => {
          if (asset.name?.endsWith(".css") && asset.name.startsWith("popup"))
            return "popup/[name].[ext]"
          return "[name].[ext]"
        },
      },
    },
    sourcemap: false,
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: false, // Keep console for debugging
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    global: "globalThis",
  },
})
