import path from "path"
import { defineConfig } from "vite"

export default defineConfig({
  resolve: {
    alias: {
      "@mujik": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: path.resolve(__dirname, "src/content/content.ts"),
      name: "ContentScript",
      formats: ["iife"],
      fileName: () => "content.js",
    },
    rollupOptions: {
      external: ["react", "react-dom"],
      output: {
        format: "iife",
      },
      treeshake: {
        preset: "smallest",
        moduleSideEffects: false,
      },
    },
  },
  define: {
    global: "globalThis",
  },
})
